/* =====================================================================
   Couche de données — Firebase (SDK modulaire v12) ou mode démo local.
   Toutes les pages passent par ce module : aucune page n'appelle Firebase
   directement.

   Mode démo : ajoutez ?demo=1 à l'URL (données fictives stockées dans le
   navigateur, idéal pour la formation des enfants). ?demo=0 pour quitter.
   ===================================================================== */
import { firebaseConfig, ROLES, DISTRICTS } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/12.6.0";

/* ---------- Rôles : normalisation robuste (données anciennes incluses) ---------- */
const ROLE_KEYS = ROLES.map(r => r.key);
export function normalizeRole(raw) {
  if (!raw) return "pres";
  const r = String(raw).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (ROLE_KEYS.includes(r)) return r;
  if (r.includes("relation") || r.includes("parlement") || r.includes("organe")) return "relations";
  if (r.includes("citoy") || r.includes("charg")) return "secretaire";
  if (r.includes("general")) return "sec";
  if (r.includes("rapport")) return "rapporteur";
  if (r.includes("vice")) return "vice";
  return "pres";
}
export const voteDocId = (voterId, role) => `${voterId}_${role}`;

/* ---------- Choix du backend ---------- */
const params = new URLSearchParams(location.search);
try {
  if (params.get("demo") === "1") sessionStorage.setItem("pec-demo", "1");
  if (params.get("demo") === "0") sessionStorage.removeItem("pec-demo");
} catch (e) { /* stockage indisponible */ }
let demoFlag = false;
try { demoFlag = sessionStorage.getItem("pec-demo") === "1"; } catch (e) {}
export const isDemo = demoFlag;

const backend = isDemo ? createDemoBackend() : await createFirebaseBackend();
export const store = backend;

/* =====================================================================
   Backend Firebase
   ===================================================================== */
async function createFirebaseBackend() {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-firestore.js`),
    import(`${FB}/firebase-auth.js`)
  ]);
  const app = initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  const auth = au.getAuth(app);
  const { collection, doc, onSnapshot, getDocs, query, where, addDoc, setDoc, updateDoc,
          deleteDoc, writeBatch, runTransaction } = fs;

  const watch = (name, cb, onErr) =>
    onSnapshot(collection(db, name),
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.error(`[${name}]`, err); onErr && onErr(err); });

  async function commitInChunks(ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(db);
      ops.slice(i, i + 400).forEach(fn => fn(b));
      await b.commit();
    }
  }
  async function deleteWhere(field, value) {
    const snap = await getDocs(query(collection(db, "votes"), where(field, "==", value)));
    await commitInChunks(snap.docs.map(d => b => b.delete(d.ref)));
  }

  return {
    kind: "firebase",
    watchCandidates: (cb, e) => watch("candidates", cb, e),
    watchVoters: (cb, e) => watch("voters", cb, e),
    watchVotes: (cb, e) => watch("votes", cb, e),

    async castVote({ voter, candidate }) {
      const role = normalizeRole(candidate.role);
      const voteRef = doc(db, "votes", voteDocId(voter.id, role));
      // Anciens votes (identifiants aléatoires) : vérification complémentaire
      const legacy = await getDocs(query(collection(db, "votes"), where("voterId", "==", voter.id)));
      if (legacy.docs.some(d => normalizeRole(d.data().role) === role)) throw codeError("already-voted");
      await runTransaction(db, async t => {
        const existing = await t.get(voteRef);
        if (existing.exists()) throw codeError("already-voted");
        t.set(voteRef, {
          voterId: voter.id, voterName: voter.name || "",
          candidateId: candidate.id, candidateName: candidate.name || "",
          role, district: voter.district || "", ts: new Date().toISOString()
        });
      });
    },

    addCandidate: data => addDoc(collection(db, "candidates"), { votes: 0, createdAt: new Date().toISOString(), ...data }),
    updateCandidate: (id, data) => updateDoc(doc(db, "candidates", id), data),
    async deleteCandidate(id) { await deleteWhere("candidateId", id); await deleteDoc(doc(db, "candidates", id)); },

    addVoter: data => addDoc(collection(db, "voters"), { createdAt: new Date().toISOString(), ...data }),
    async addVotersBulk(list) {
      const ref = collection(db, "voters");
      await commitInChunks(list.map(v => b => b.set(doc(ref), { createdAt: new Date().toISOString(), ...v })));
    },
    updateVoter: (id, data) => updateDoc(doc(db, "voters", id), data),
    async deleteVoter(id) { await deleteWhere("voterId", id); await deleteDoc(doc(db, "voters", id)); },

    async resetVotes() {
      const snap = await getDocs(collection(db, "votes"));
      await commitInChunks(snap.docs.map(d => b => b.delete(d.ref)));
      const cs = await getDocs(collection(db, "candidates"));
      await commitInChunks(cs.docs.map(d => b => b.update(d.ref, { votes: 0 })));
    },
    async normalizeCandidateRoles(candidates) {
      const fix = candidates.filter(c => c.role !== normalizeRole(c.role));
      if (fix.length) await commitInChunks(fix.map(c => b => b.update(doc(db, "candidates", c.id), { role: normalizeRole(c.role) })));
      return fix.length;
    },

    onAuth: cb => au.onAuthStateChanged(auth, cb),
    signIn: (email, pw) => au.signInWithEmailAndPassword(auth, email, pw),
    signOut: () => au.signOut(auth)
  };
}

function codeError(code) { const e = new Error(code); e.code = code; return e; }

/* =====================================================================
   Backend démo (localStorage + synchronisation entre onglets)
   ===================================================================== */
function createDemoBackend() {
  const KEY = "pec-demo-db-v1";
  const listeners = { candidates: new Set(), voters: new Set(), votes: new Set() };
  let chan = null;
  try { chan = new BroadcastChannel("pec-demo"); } catch (e) {}

  function seed() {
    const first = ["Grâce", "Merveille", "Christ", "Divine", "Exaucé", "Prisca", "Josué", "Bénédicte", "Dieuveil", "Ornella",
                   "Fortuné", "Anaëlle", "Glodi", "Plamedie", "Jordy", "Naomie", "Rolph", "Chancelvie", "Trésor", "Mirabelle",
                   "Destin", "Sagesse", "Emmanuel", "Precieuse", "Junior", "Gloire", "Nelly", "Brunel", "Ruth", "Kevin"];
    const last = ["Mabiala", "Okemba", "Ngoma", "Loemba", "Ibara", "Mavoungou", "Ndinga", "Moukouri", "Bouanga", "Ossété",
                  "Makaya", "Ebata", "Ngouabi", "Kimbembe", "Mpassi", "Elenga", "Tchicaya", "Obambi", "Malonga", "Ndzaba"];
    const rnd = mulberry(42);
    const pick = a => a[Math.floor(rnd() * a.length)];
    const id = p => p + Math.floor(rnd() * 1e9).toString(36);
    const voters = Array.from({ length: 45 }, (_, i) => ({
      id: id("v"), name: `${first[i % first.length]} ${pick(last)}`, district: DISTRICTS[i % DISTRICTS.length], emoji: ""
    }));
    const candidates = [];
    ROLES.forEach(r => { for (let i = 0; i < 3; i++) {
      const v = voters[Math.floor(rnd() * voters.length)];
      candidates.push({ id: id("c"), name: `${pick(first)} ${pick(last)}`, role: r.key, district: v.district, slogan: "", imageUrl: "", votes: 0 });
    }});
    const votes = [];
    voters.slice(0, 26).forEach(v => ROLES.forEach(r => {
      if (rnd() < 0.15) return;
      const opts = candidates.filter(c => c.role === r.key);
      const c = opts[Math.floor(Math.pow(rnd(), 1.6) * opts.length)];
      votes.push({ id: voteDocId(v.id, r.key), voterId: v.id, voterName: v.name, candidateId: c.id, candidateName: c.name, role: r.key, district: v.district, ts: new Date(Date.now() - rnd() * 864e5).toISOString() });
    }));
    return { candidates, voters, votes };
  }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    const d = seed(); save(d, false); return d;
  }
  function save(d, notify = true) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
    if (notify) { emitAll(); chan && chan.postMessage("change"); }
  }
  let data = load();
  function emit(name) { const list = data[name].map(x => ({ ...x })); listeners[name].forEach(cb => cb(list)); }
  function emitAll() { Object.keys(listeners).forEach(emit); }
  if (chan) chan.onmessage = () => { data = load(); emitAll(); };
  const watch = name => cb => { listeners[name].add(cb); setTimeout(() => cb(data[name].map(x => ({ ...x }))), 0); return () => listeners[name].delete(cb); };
  const nid = p => p + Math.random().toString(36).slice(2, 11);
  const delay = (ms = 250) => new Promise(r => setTimeout(r, ms));
  let demoUser = null; const authCbs = new Set();
  try { if (sessionStorage.getItem("pec-demo-admin")) demoUser = { email: sessionStorage.getItem("pec-demo-admin") }; } catch (e) {}

  return {
    kind: "demo",
    watchCandidates: watch("candidates"), watchVoters: watch("voters"), watchVotes: watch("votes"),
    async castVote({ voter, candidate }) {
      await delay(400);
      const role = normalizeRole(candidate.role);
      if (data.votes.some(v => v.voterId === voter.id && normalizeRole(v.role) === role)) throw codeError("already-voted");
      data.votes.push({ id: voteDocId(voter.id, role), voterId: voter.id, voterName: voter.name, candidateId: candidate.id, candidateName: candidate.name, role, district: voter.district || "", ts: new Date().toISOString() });
      save(data);
    },
    async addCandidate(d) { await delay(); data.candidates.push({ id: nid("c"), votes: 0, ...d }); save(data); },
    async updateCandidate(id, d) { await delay(); Object.assign(data.candidates.find(c => c.id === id) || {}, d); save(data); },
    async deleteCandidate(id) { await delay(); data.candidates = data.candidates.filter(c => c.id !== id); data.votes = data.votes.filter(v => v.candidateId !== id); save(data); },
    async addVoter(d) { await delay(); data.voters.push({ id: nid("v"), ...d }); save(data); },
    async addVotersBulk(list) { await delay(); list.forEach(d => data.voters.push({ id: nid("v"), ...d })); save(data); },
    async updateVoter(id, d) { await delay(); Object.assign(data.voters.find(v => v.id === id) || {}, d); save(data); },
    async deleteVoter(id) { await delay(); data.voters = data.voters.filter(v => v.id !== id); data.votes = data.votes.filter(v => v.voterId !== id); save(data); },
    async resetVotes() { await delay(); data.votes = []; save(data); },
    async normalizeCandidateRoles() { return 0; },
    async resetDemo() { data = seed(); save(data); },
    onAuth(cb) { authCbs.add(cb); setTimeout(() => cb(demoUser), 0); return () => authCbs.delete(cb); },
    async signIn(email) { await delay(); demoUser = { email: email || "demo@parlement.cg" }; try { sessionStorage.setItem("pec-demo-admin", demoUser.email); } catch (e) {} authCbs.forEach(cb => cb(demoUser)); },
    async signOut() { demoUser = null; try { sessionStorage.removeItem("pec-demo-admin"); } catch (e) {} authCbs.forEach(cb => cb(null)); }
  };
}

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
