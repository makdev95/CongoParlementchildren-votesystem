/* =====================================================================
   Couche de données — Firebase (SDK modulaire v12) ou mode démo local.
   Toutes les pages passent par ce module : aucune page n'appelle Firebase
   directement.

   ÉDITIONS : chaque candidat, électeur et bulletin porte un champ
   « edition » (ex. "2025", "2026"). Le document settings/election indique
   l'édition en cours ; les éditions précédentes restent consultables dans
   l'historique. Tant que ce document n'existe pas (avant la première
   configuration par l'admin), toutes les données sont affichées telles quelles.

   Mode démo : ajoutez ?demo=1 à l'URL (données fictives stockées dans le
   navigateur, idéal pour la formation des enfants). ?demo=0 pour quitter.
   ===================================================================== */
import { firebaseConfig, ROLES, DISTRICTS } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/12.6.0";
const COLLS = ["candidates", "voters", "votes"];

/* ---------- Rôles : normalisation robuste (données anciennes incluses) ---------- */
const ROLE_KEYS = ROLES.map(r => r.key);
export const stripAccents = s => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "");
export function normalizeRole(raw) {
  if (!raw) return "pres";
  const r = stripAccents(String(raw).toLowerCase()).trim();
  if (ROLE_KEYS.includes(r)) return r;
  if (r.includes("relation") || r.includes("parlement") || r.includes("organe")) return "relations";
  if (r.includes("citoy") || r.includes("charg")) return "secretaire";
  if (r.includes("general")) return "sec";
  if (r.includes("rapport")) return "rapporteur";
  if (r.includes("vice")) return "vice";
  return "pres";
}
export const voteDocId = (voterId, role) => `${voterId}_${role}`;

/* ---------- Décompte d'un poste (classement trié, égalités détectées) ---------- */
export function tally(candidates, votes, roleKey) {
  const cands = candidates.filter(c => normalizeRole(c.role) === roleKey);
  const counts = new Map(cands.map(c => [c.id, 0]));
  votes.forEach(v => { if (normalizeRole(v.role) === roleKey && counts.has(v.candidateId)) counts.set(v.candidateId, counts.get(v.candidateId) + 1); });
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const list = cands.map(c => ({ ...c, n: counts.get(c.id) }))
    .sort((a, b) => b.n - a.n || String(a.name).localeCompare(String(b.name), "fr"));
  const tie = list.length > 1 && list[0].n > 0 && list[0].n === list[1].n;
  return { list, total, winner: list[0] && list[0].n > 0 && !tie ? list[0] : null, tie };
}

/* ---------- Éditions ---------- */
export function editionList(settings) {
  return ((settings && settings.editions) || []).slice().sort((a, b) => String(b.id).localeCompare(String(a.id)));
}
export function editionLabel(settings, id) {
  const e = editionList(settings).find(x => x.id === id);
  return e ? (e.label || `Édition ${e.id}`) : (id ? `Édition ${id}` : "");
}

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
   Abonnement à une édition.
   edition : "current" (suit l'édition en cours) ou un identifiant ("2025").
   h : { settings, edition, candidates, voters, votes } — fonctions de rappel.
   ===================================================================== */
export function watchElection(edition, h, onErr) {
  let subs = [], current, started = false;
  const subscribe = ed => {
    subs.forEach(u => u()); subs = [];
    current = ed; started = true;
    h.edition && h.edition(ed);
    COLLS.forEach(name => subs.push(backend.watchColl(name, ed, l => h[name] && h[name](l), onErr)));
  };
  const onSettings = s => {
    h.settings && h.settings(s);
    const ed = edition === "current" ? ((s && s.currentEdition) || null) : edition;
    if (!started || ed !== current) subscribe(ed);
  };
  // Si le document de paramètres est illisible (anciennes règles), on continue sans éditions.
  const unS = backend.watchSettings(onSettings, err => { console.warn("[settings]", err); onSettings(null); });
  return () => { unS(); subs.forEach(u => u()); };
}

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
  const { collection, doc, onSnapshot, getDocs, getDoc, query, where, addDoc, setDoc, updateDoc,
          deleteDoc, writeBatch, runTransaction } = fs;
  const settingsRef = doc(db, "settings", "election");
  const now = () => new Date().toISOString();

  const scoped = (name, ed) => ed ? query(collection(db, name), where("edition", "==", ed)) : collection(db, name);
  async function commitInChunks(ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(db);
      ops.slice(i, i + 400).forEach(fn => fn(b));
      await b.commit();
    }
  }
  async function deleteVotesWhere(field, value) {
    const snap = await getDocs(query(collection(db, "votes"), where(field, "==", value)));
    await commitInChunks(snap.docs.map(d => b => b.delete(d.ref)));
  }
  const withEd = (data, ed) => (ed ? { ...data, edition: ed } : data);

  return {
    kind: "firebase",
    watchSettings: (cb, onErr) => onSnapshot(settingsRef, s => cb(s.exists() ? s.data() : null), onErr),
    watchColl: (name, ed, cb, onErr) => onSnapshot(scoped(name, ed),
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.error(`[${name}]`, err); onErr && onErr(err); }),

    async castVote({ voter, candidate, edition }) {
      const role = normalizeRole(candidate.role);
      const voteRef = doc(db, "votes", voteDocId(voter.id, role));
      // Anciens votes (identifiants aléatoires) : vérification complémentaire
      const prev = await getDocs(query(collection(db, "votes"), where("voterId", "==", voter.id)));
      if (prev.docs.some(d => normalizeRole(d.data().role) === role)) throw codeError("already-voted");
      await runTransaction(db, async t => {
        const existing = await t.get(voteRef);
        if (existing.exists()) throw codeError("already-voted");
        t.set(voteRef, withEd({
          voterId: voter.id, voterName: voter.name || "",
          candidateId: candidate.id, candidateName: candidate.name || "",
          role, district: voter.district || "", ts: now()
        }, edition));
      });
    },

    addCandidate: (data, ed) => addDoc(collection(db, "candidates"), withEd({ votes: 0, createdAt: now(), ...data }, ed)),
    updateCandidate: (id, data) => updateDoc(doc(db, "candidates", id), data),
    async deleteCandidate(id) { await deleteVotesWhere("candidateId", id); await deleteDoc(doc(db, "candidates", id)); },

    addVoter: (data, ed) => addDoc(collection(db, "voters"), withEd({ createdAt: now(), ...data }, ed)),
    async addVotersBulk(list, ed) {
      const ref = collection(db, "voters");
      await commitInChunks(list.map(v => b => b.set(doc(ref), withEd({ createdAt: now(), ...v }, ed))));
    },
    updateVoter: (id, data) => updateDoc(doc(db, "voters", id), data),
    async deleteVoter(id) { await deleteVotesWhere("voterId", id); await deleteDoc(doc(db, "voters", id)); },

    async resetVotes(ed) {
      const snap = await getDocs(scoped("votes", ed));
      await commitInChunks(snap.docs.map(d => b => b.delete(d.ref)));
    },
    async normalizeCandidateRoles(candidates) {
      const fix = candidates.filter(c => c.role !== normalizeRole(c.role));
      if (fix.length) await commitInChunks(fix.map(c => b => b.update(doc(db, "candidates", c.id), { role: normalizeRole(c.role) })));
      return fix.length;
    },

    /* Première configuration : les données sans édition deviennent l'édition archivée,
       puis une nouvelle édition est ouverte. Rien n'est supprimé. */
    async setupEditions({ archiveId, archiveLabel, newId, newLabel, copyVoters }) {
      let tagged = 0, copied = 0;
      const archivedVoters = [];
      for (const name of COLLS) {
        const snap = await getDocs(collection(db, name));
        const todo = snap.docs.filter(d => !d.data().edition);
        tagged += todo.length;
        await commitInChunks(todo.map(d => b => b.update(d.ref, { edition: archiveId })));
        if (name === "voters") snap.docs.forEach(d => { const v = d.data(); if (!v.edition || v.edition === archiveId) archivedVoters.push(v); });
      }
      if (copyVoters) {
        const ref = collection(db, "voters");
        await commitInChunks(archivedVoters.map(v => b => b.set(doc(ref), { name: v.name || "", district: v.district || "", emoji: v.emoji || "", edition: newId, createdAt: now() })));
        copied = archivedVoters.length;
      }
      await setDoc(settingsRef, {
        currentEdition: newId,
        editions: [
          { id: archiveId, label: archiveLabel, status: "archived", closedAt: now() },
          { id: newId, label: newLabel, status: "open", openedAt: now() }
        ],
        updatedAt: now()
      });
      return { tagged, copied };
    },

    /* Ouvre une nouvelle édition ; l'édition en cours passe dans l'historique. */
    async openEdition({ id, label, copyVoters }) {
      const s = (await getDoc(settingsRef)).data();
      if (!s) throw new Error("Éditions non configurées");
      if ((s.editions || []).some(e => e.id === id)) throw codeError("edition-exists");
      const prevId = s.currentEdition;
      const editions = (s.editions || []).map(e => e.id === prevId ? { ...e, status: "archived", closedAt: now() } : e);
      editions.push({ id, label, status: "open", openedAt: now() });
      let copied = 0;
      if (copyVoters && prevId) {
        const vs = await getDocs(scoped("voters", prevId));
        const ref = collection(db, "voters");
        await commitInChunks(vs.docs.map(d => { const v = d.data(); return b => b.set(doc(ref), { name: v.name || "", district: v.district || "", emoji: v.emoji || "", edition: id, createdAt: now() }); }));
        copied = vs.size;
      }
      await setDoc(settingsRef, { currentEdition: id, editions, updatedAt: now() });
      return { copied };
    },
    async renameEdition(id, label) {
      const s = (await getDoc(settingsRef)).data();
      await updateDoc(settingsRef, { editions: (s.editions || []).map(e => e.id === id ? { ...e, label } : e), updatedAt: now() });
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
  const KEY = "pec-demo-db-v2";
  const listeners = new Set();       // { name, ed, cb }
  const settingsCbs = new Set();
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
    const out = { candidates: [], voters: [], votes: [] };
    const make = (ed, nVoters, turnout, offset) => {
      const voters = Array.from({ length: nVoters }, (_, i) => ({
        id: id("v"), edition: ed, name: `${first[(i + offset) % first.length]} ${pick(last)}`, district: DISTRICTS[(i + offset) % DISTRICTS.length], emoji: ""
      }));
      const cands = [];
      ROLES.forEach(r => { for (let i = 0; i < 3; i++) {
        cands.push({ id: id("c"), edition: ed, name: `${pick(first)} ${pick(last)}`, role: r.key, district: pick(DISTRICTS), slogan: "", imageUrl: "", votes: 0 });
      }});
      voters.slice(0, Math.round(nVoters * turnout)).forEach(v => ROLES.forEach(r => {
        if (rnd() < 0.1) return;
        const opts = cands.filter(c => c.role === r.key);
        const c = opts[Math.floor(Math.pow(rnd(), 1.6) * opts.length)];
        out.votes.push({ id: voteDocId(v.id, r.key), edition: ed, voterId: v.id, voterName: v.name, candidateId: c.id, candidateName: c.name, role: r.key, district: v.district, ts: new Date(Date.now() - rnd() * 864e5 * (ed === "2025" ? 400 : 1)).toISOString() });
      }));
      out.voters.push(...voters); out.candidates.push(...cands);
    };
    make("2025", 40, 0.9, 0);
    make("2026", 45, 0.4, 7);
    out.settings = { currentEdition: "2026", editions: [
      { id: "2025", label: "Bureau 2025", status: "archived", closedAt: "2025-10-15T12:00:00.000Z" },
      { id: "2026", label: "Édition 2026", status: "open", openedAt: new Date().toISOString() }
    ] };
    return out;
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
  const filtered = (name, ed) => data[name].filter(x => !ed || x.edition === ed).map(x => ({ ...x }));
  function emitAll() {
    listeners.forEach(l => l.cb(filtered(l.name, l.ed)));
    settingsCbs.forEach(cb => cb(data.settings ? JSON.parse(JSON.stringify(data.settings)) : null));
  }
  if (chan) chan.onmessage = () => { data = load(); emitAll(); };
  const nid = p => p + Math.random().toString(36).slice(2, 11);
  const delay = (ms = 250) => new Promise(r => setTimeout(r, ms));
  const withEd = (d, ed) => (ed ? { ...d, edition: ed } : d);
  let demoUser = null; const authCbs = new Set();
  try { if (sessionStorage.getItem("pec-demo-admin")) demoUser = { email: sessionStorage.getItem("pec-demo-admin") }; } catch (e) {}

  return {
    kind: "demo",
    watchSettings(cb) { settingsCbs.add(cb); setTimeout(() => cb(data.settings ? JSON.parse(JSON.stringify(data.settings)) : null), 0); return () => settingsCbs.delete(cb); },
    watchColl(name, ed, cb) { const l = { name, ed, cb }; listeners.add(l); setTimeout(() => cb(filtered(name, ed)), 0); return () => listeners.delete(l); },
    async castVote({ voter, candidate, edition }) {
      await delay(400);
      const role = normalizeRole(candidate.role);
      if (data.votes.some(v => v.voterId === voter.id && normalizeRole(v.role) === role)) throw codeError("already-voted");
      data.votes.push(withEd({ id: voteDocId(voter.id, role), voterId: voter.id, voterName: voter.name, candidateId: candidate.id, candidateName: candidate.name, role, district: voter.district || "", ts: new Date().toISOString() }, edition));
      save(data);
    },
    async addCandidate(d, ed) { await delay(); data.candidates.push(withEd({ id: nid("c"), votes: 0, ...d }, ed)); save(data); },
    async updateCandidate(id, d) { await delay(); Object.assign(data.candidates.find(c => c.id === id) || {}, d); save(data); },
    async deleteCandidate(id) { await delay(); data.candidates = data.candidates.filter(c => c.id !== id); data.votes = data.votes.filter(v => v.candidateId !== id); save(data); },
    async addVoter(d, ed) { await delay(); data.voters.push(withEd({ id: nid("v"), ...d }, ed)); save(data); },
    async addVotersBulk(list, ed) { await delay(); list.forEach(d => data.voters.push(withEd({ id: nid("v"), ...d }, ed))); save(data); },
    async updateVoter(id, d) { await delay(); Object.assign(data.voters.find(v => v.id === id) || {}, d); save(data); },
    async deleteVoter(id) { await delay(); data.voters = data.voters.filter(v => v.id !== id); data.votes = data.votes.filter(v => v.voterId !== id); save(data); },
    async resetVotes(ed) { await delay(); data.votes = data.votes.filter(v => ed && v.edition !== ed); save(data); },
    async normalizeCandidateRoles() { return 0; },
    async setupEditions({ archiveId, archiveLabel, newId, newLabel, copyVoters }) {
      await delay(); let tagged = 0;
      COLLS.forEach(n => data[n].forEach(x => { if (!x.edition) { x.edition = archiveId; tagged++; } }));
      const prev = data.voters.filter(v => v.edition === archiveId);
      if (copyVoters) prev.forEach(v => data.voters.push({ id: nid("v"), name: v.name, district: v.district || "", emoji: "", edition: newId }));
      data.settings = { currentEdition: newId, editions: [
        { id: archiveId, label: archiveLabel, status: "archived", closedAt: new Date().toISOString() },
        { id: newId, label: newLabel, status: "open", openedAt: new Date().toISOString() }] };
      save(data); return { tagged, copied: copyVoters ? prev.length : 0 };
    },
    async openEdition({ id, label, copyVoters }) {
      await delay(); const s = data.settings;
      if (s.editions.some(e => e.id === id)) throw codeError("edition-exists");
      const prevId = s.currentEdition;
      s.editions = s.editions.map(e => e.id === prevId ? { ...e, status: "archived", closedAt: new Date().toISOString() } : e);
      s.editions.push({ id, label, status: "open", openedAt: new Date().toISOString() });
      s.currentEdition = id;
      const prev = data.voters.filter(v => v.edition === prevId);
      if (copyVoters) prev.forEach(v => data.voters.push({ id: nid("v"), name: v.name, district: v.district || "", emoji: "", edition: id }));
      save(data); return { copied: copyVoters ? prev.length : 0 };
    },
    async renameEdition(id, label) { await delay(); data.settings.editions = data.settings.editions.map(e => e.id === id ? { ...e, label } : e); save(data); },
    async resetDemo(withoutEditions = false) {
      data = seed();
      if (withoutEditions) { delete data.settings; COLLS.forEach(n => data[n] = data[n].filter(x => x.edition === "2025").map(x => { const y = { ...x }; delete y.edition; return y; })); }
      save(data);
    },
    onAuth(cb) { authCbs.add(cb); setTimeout(() => cb(demoUser), 0); return () => authCbs.delete(cb); },
    async signIn(email) { await delay(); demoUser = { email: email || "demo@parlement.cg" }; try { sessionStorage.setItem("pec-demo-admin", demoUser.email); } catch (e) {} authCbs.forEach(cb => cb(demoUser)); },
    async signOut() { demoUser = null; try { sessionStorage.removeItem("pec-demo-admin"); } catch (e) {} authCbs.forEach(cb => cb(null)); }
  };
}

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
