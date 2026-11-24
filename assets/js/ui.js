/* =====================================================================
   Composants d'interface partagés : en-tête, pied de page, avatars,
   notifications, confettis, fenêtres modales.
   ===================================================================== */
import { ELECTION, UNICEF_LOGO_URL } from "./config.js";

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = n => new Intl.NumberFormat("fr-FR").format(n || 0);
export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

/* ---------- Drapeau du Congo (SVG) ---------- */
export const flagSvg = (w = 36) => `
<svg class="flag" width="${w}" height="${Math.round(w * 2 / 3)}" viewBox="0 0 3 2" role="img" aria-label="Drapeau de la République du Congo">
  <path fill="#009543" d="M0 0h3v2H0z"/><path fill="#FBDE4A" d="M2 0h1L1 2H0z"/><path fill="#DC241F" d="M3 0v2H1z"/>
</svg>`;

/* ---------- En-tête et pied de page ---------- */
const NAV = [
  { href: "index.html", label: "Accueil", id: "home" },
  { href: "vote.html", label: "Voter", id: "vote" },
  { href: "podium.html", label: "Résultats", id: "results" },
  { href: "index.html#droits", label: "Nos droits", id: "rights" }
];

/* Mode démo connu sans attendre le chargement de Firebase */
export const demoMode = (() => {
  try {
    const p = new URLSearchParams(location.search).get("demo");
    if (p === "1") return true; if (p === "0") return false;
    return sessionStorage.getItem("pec-demo") === "1";
  } catch (e) { return false; }
})();

export function renderChrome(active, { isDemo = demoMode, minimal = false } = {}) {
  const header = $("#site-header");
  if (header) {
    header.className = "site-header";
    header.innerHTML = `
      ${isDemo ? `<div class="demo-bar">🧪 Mode démonstration — données fictives, rien n'est enregistré dans la base officielle. <a href="?demo=0">Quitter le mode démo</a></div>` : ""}
      <div class="header-inner container">
        <a class="brand" href="index.html" aria-label="Accueil — ${esc(ELECTION.org)}">
          <img src="logope.png" alt="" width="48" height="48" class="brand-logo">
          <span class="brand-text"><strong>Parlement des Enfants</strong><small>République du Congo ${flagSvg(18)}</small></span>
        </a>
        ${minimal ? "" : `
        <button class="nav-toggle" aria-expanded="false" aria-controls="main-nav" aria-label="Ouvrir le menu"><span></span><span></span><span></span></button>
        <nav id="main-nav" class="main-nav" aria-label="Navigation principale">
          ${NAV.map(n => `<a href="${n.href}" class="${n.id === active ? "active" : ""}" ${n.id === active ? 'aria-current="page"' : ""}>${n.label}</a>`).join("")}
          <a href="vote.html" class="btn btn-primary btn-sm nav-cta">🗳️ Je vote</a>
        </nav>`}
      </div>
      <div class="flag-stripe" aria-hidden="true"></div>`;
    const t = $(".nav-toggle", header);
    t && t.addEventListener("click", () => {
      const open = header.classList.toggle("nav-open");
      t.setAttribute("aria-expanded", String(open));
    });
  }
  const footer = $("#site-footer");
  if (footer) {
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="container footer-grid">
        <div class="footer-brand">
          <img src="logope.png" alt="Logo du Parlement des Enfants du Congo" width="72" height="72">
          <div>
            <strong>${esc(ELECTION.org)}</strong>
            <p>Une plateforme pour que chaque enfant du Congo puisse s'exprimer, choisir et être entendu.</p>
            <p class="motto">${flagSvg(22)} ${esc(ELECTION.country)} — ${esc(ELECTION.motto)}</p>
          </div>
        </div>
        <div class="footer-partner">
          <span class="eyebrow">Avec l'appui de</span>
          ${unicefLogo("footer-unicef")}
          <small>pour chaque enfant</small>
        </div>
        <nav class="footer-links" aria-label="Liens du pied de page">
          <a href="index.html">Accueil</a><a href="vote.html">Voter</a><a href="podium.html">Résultats</a>
          <a href="index.html#droits">Droits de l'enfant</a><a href="admin.html">Espace organisateurs</a>
        </nav>
      </div>
      <div class="container footer-bottom">
        <span>© ${new Date().getFullYear()} ${esc(ELECTION.org)} · Édition ${esc(ELECTION.edition)}</span>
        <span>Convention relative aux droits de l'enfant — Article 12 : le droit d'être entendu.</span>
      </div>`;
  }
}

export function unicefLogo(cls = "") {
  return `<span class="unicef-logo ${cls}"><img src="${UNICEF_LOGO_URL}" alt="UNICEF" loading="lazy"
    onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'unicef-fallback',textContent:'unicef'}))"></span>`;
}

/* ---------- Avatars d'enfants générés (déterministes) ---------- */
function seeded(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const avatarCache = new Map();
export function childAvatar(seed = "x") {
  if (avatarCache.has(seed)) return avatarCache.get(seed);
  const r = seeded(String(seed)); const p = a => a[Math.floor(r() * a.length)];
  const skin = p(["#8d5524", "#6b3e1f", "#a0662f", "#7a4a26", "#5c3317", "#b77942"]);
  const hair = p(["#1b1110", "#24150f", "#2e1a12"]);
  const shirt = p(["#1CABE2", "#2f6fdb", "#7c4dff", "#ff8a3d", "#e94d8a", "#14b8a6", "#f4c20d"]);
  const bg = p(["#e0f4fd", "#fff4d6", "#e6f6ea", "#fde8e8", "#efe9ff", "#fff0e1"]);
  const style = Math.floor(r() * 4);
  const hairSvg = [
    `<circle cx="60" cy="46" r="27" fill="${hair}"/>`,
    `<circle cx="60" cy="48" r="25" fill="${hair}"/><circle cx="36" cy="34" r="11" fill="${hair}"/><circle cx="84" cy="34" r="11" fill="${hair}"/>`,
    `<path d="M33 52c0-20 12-30 27-30s27 10 27 30c-4-9-14-14-27-14s-23 5-27 14z" fill="${hair}"/>`,
    `<circle cx="60" cy="47" r="26" fill="${hair}"/><circle cx="60" cy="17" r="10" fill="${hair}"/>`
  ][style];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="${bg}"/>
    <path d="M22 120c2-24 18-36 38-36s36 12 38 36z" fill="${shirt}"/>
    <path d="M40 88l40 32h-14L34 94z" fill="#009543"/><path d="M45 90l37 30h-8L41 95z" fill="#FBDE4A"/><path d="M50 92l34 28h-4L47 97z" fill="#DC241F"/>
    <rect x="53" y="70" width="14" height="16" rx="6" fill="${skin}"/>
    ${hairSvg}
    <ellipse cx="60" cy="56" rx="22" ry="24" fill="${skin}"/>
    <circle cx="51" cy="54" r="3.2" fill="#1a1a1a"/><circle cx="69" cy="54" r="3.2" fill="#1a1a1a"/>
    <circle cx="52" cy="53" r="1" fill="#fff"/><circle cx="70" cy="53" r="1" fill="#fff"/>
    <path d="M51 65q9 8 18 0" stroke="#3a1c0c" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <circle cx="45" cy="62" r="3.5" fill="#e86b6b" opacity=".35"/><circle cx="75" cy="62" r="3.5" fill="#e86b6b" opacity=".35"/>
    ${style === 1 ? `<path d="M36 36l-6-4m54 4l6-4" stroke="#DC241F" stroke-width="4" stroke-linecap="round"/>` : ""}
  </svg>`;
  const url = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  avatarCache.set(seed, url);
  return url;
}
export const avatarFor = person => (person && person.imageUrl) ? person.imageUrl : childAvatar(person ? person.id : "x");
export const initials = name => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join("");

/* ---------- Notifications ---------- */
export function toast(text, type = "info", ttl = 2800) {
  let host = $(".toast-host");
  if (!host) { host = document.createElement("div"); host.className = "toast-host"; host.setAttribute("role", "status"); host.setAttribute("aria-live", "polite"); document.body.appendChild(host); }
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${{ success: "✅", error: "⚠️", info: "ℹ️" }[type] || "ℹ️"}</span><span>${esc(text)}</span>`;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 350); }, ttl);
}

/* ---------- Fenêtres modales accessibles ---------- */
export function openModal(el) {
  el.hidden = false; el.classList.add("open");
  el._prevFocus = document.activeElement;
  const f = el.querySelector("[autofocus], input, button, [tabindex='0']");
  setTimeout(() => f && f.focus(), 30);
  el._esc = e => { if (e.key === "Escape") closeModal(el); };
  document.addEventListener("keydown", el._esc);
  document.body.classList.add("modal-lock");
}
export function closeModal(el) {
  el.classList.remove("open"); el.hidden = true;
  document.removeEventListener("keydown", el._esc);
  document.body.classList.remove("modal-lock");
  el._prevFocus && el._prevFocus.focus && el._prevFocus.focus();
  el.dispatchEvent(new CustomEvent("modal-close"));
}
export function bindModalClose(el) {
  el.addEventListener("click", e => { if (e.target === el || e.target.closest("[data-close]")) closeModal(el); });
}

/* Boîte de confirmation (remplace confirm()) */
export function confirmDialog({ title, body, okText = "Confirmer", cancelText = "Annuler", danger = false, requireText = "" }) {
  return new Promise(resolve => {
    const m = document.createElement("div");
    m.className = "modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
    m.innerHTML = `<div class="modal-card modal-sm">
      <h3>${esc(title)}</h3><div class="modal-body">${body}
      ${requireText ? `<label for="cfText">Tapez <strong>${esc(requireText)}</strong> pour confirmer</label><input id="cfText" type="text" autocomplete="off" autofocus>` : ""}</div>
      <div class="modal-actions"><button class="btn btn-ghost" data-act="no">${esc(cancelText)}</button>
      <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="yes" ${requireText ? "disabled" : "autofocus"}>${esc(okText)}</button></div></div>`;
    document.body.appendChild(m);
    if (requireText) {
      const inp = m.querySelector("#cfText"), ok = m.querySelector('[data-act="yes"]');
      inp.addEventListener("input", () => { ok.disabled = inp.value.trim().toUpperCase() !== requireText.toUpperCase(); });
    }
    const done = v => { resolve(v); closeModal(m); m.remove(); };
    m.addEventListener("click", e => { const a = e.target.closest("[data-act]"); if (a && !a.disabled) done(a.dataset.act === "yes"); else if (e.target === m) done(false); });
    openModal(m);
    m.addEventListener("modal-close", () => resolve(false), { once: true });
  });
}

/* ---------- Animation des compteurs ---------- */
export function countUp(el, to, ms = 900) {
  const from = Number(el.dataset.v || 0); el.dataset.v = to;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / ms); el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ---------- Confettis aux couleurs du Congo ---------- */
let confCanvas, confCtx, parts = [], running = false;
export function confetti(x = innerWidth / 2, y = innerHeight / 2, n = 90) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!confCanvas) {
    confCanvas = document.createElement("canvas"); confCanvas.className = "confetti-canvas"; document.body.appendChild(confCanvas);
    confCtx = confCanvas.getContext("2d");
    const rs = () => { confCanvas.width = innerWidth; confCanvas.height = innerHeight; }; rs(); addEventListener("resize", rs);
  }
  const colors = ["#009543", "#FBDE4A", "#DC241F", "#1CABE2", "#ffffff"];
  for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - .5) * 14, vy: Math.random() * -14 - 4, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, s: 6 + Math.random() * 7, c: colors[i % colors.length], life: 90 + Math.random() * 50 });
  if (!running) loop();
}
function loop() {
  running = true;
  confCtx.clearRect(0, 0, confCanvas.width, confCanvas.height);
  parts = parts.filter(p => p.life > 0 && p.y < confCanvas.height + 40);
  parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .42; p.vx *= .99; p.r += p.vr; p.life--;
    confCtx.save(); confCtx.translate(p.x, p.y); confCtx.rotate(p.r); confCtx.fillStyle = p.c; confCtx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); confCtx.restore(); });
  if (parts.length) requestAnimationFrame(loop); else { running = false; confCtx.clearRect(0, 0, confCanvas.width, confCanvas.height); }
}

/* ---------- Message d'erreur de connexion Firebase ---------- */
export function describeError(err) {
  const code = (err && (err.code || err.message)) || "";
  if (code.includes("permission-denied") || code.includes("insufficient permissions"))
    return "Accès refusé par la base de données. Les règles Firestore doivent être mises à jour (voir README).";
  if (code.includes("unavailable") || code.includes("network")) return "Connexion impossible. Vérifiez Internet puis réessayez.";
  if (code.includes("already-voted")) return "Tu as déjà voté pour ce poste.";
  return "Une erreur est survenue. Réessayez dans un instant.";
}

/* Révélation au défilement */
export function revealOnScroll() {
  const els = $$(".reveal");
  if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
  els.forEach(e => io.observe(e));
}
