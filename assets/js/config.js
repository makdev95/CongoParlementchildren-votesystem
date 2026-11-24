/* =====================================================================
   Parlement des Enfants du Congo — configuration centrale
   Modifiez ce fichier pour changer l'édition, les postes ou les départements.
   ===================================================================== */

/* Configuration Firebase (clé Web publique : la sécurité est assurée par
   les règles Firestore — voir firestore.rules à la racine du dépôt). */
export const firebaseConfig = {
  apiKey: "AIzaSyA_cdwwXT6DRcEm-555RxXETZ0Pwnv0bcQ",
  authDomain: "parlementvotesystemv1.firebaseapp.com",
  projectId: "parlementvotesystemv1",
  storageBucket: "parlementvotesystemv1.firebasestorage.app",
  messagingSenderId: "1014390957615",
  appId: "1:1014390957615:web:2ced35e18d4236451488da",
  measurementId: "G-J8VSKCE3M8"
};

/* Édition en cours */
export const ELECTION = {
  edition: "2026",
  title: "Élection du Bureau Exécutif National",
  org: "Parlement des Enfants du Congo",
  country: "République du Congo",
  motto: "Unité · Travail · Progrès"
};

/* La page d'administration exige une connexion Firebase Auth (email + mot de passe).
   Mettez à false UNIQUEMENT pour un test local — les règles Firestore refuseront
   de toute façon les écritures d'un utilisateur non connecté. */
export const REQUIRE_ADMIN_LOGIN = true;

/* Postes du Bureau exécutif (l'ordre est celui de l'affichage) */
export const ROLES = [
  { key: "pres",       title: "Président·e",                     short: "Présidence",     icon: "🏛️", desc: "Dirige le Bureau et porte la voix des enfants auprès des institutions." },
  { key: "vice",       title: "Vice-Président·e",                short: "Vice-présidence", icon: "🤝", desc: "Seconde la présidence et la remplace en cas d'absence." },
  { key: "sec",        title: "Secrétaire Général·e",            short: "Secrétariat",    icon: "📋", desc: "Organise les sessions, les comptes rendus et la vie du Parlement." },
  { key: "rapporteur", title: "Rapporteur·e",                    short: "Rapport",        icon: "📝", desc: "Rédige et présente les rapports et recommandations des enfants." },
  { key: "secretaire", title: "Secrétaire chargé·e de la Citoyenneté", short: "Citoyenneté", icon: "🌍", desc: "Promeut la participation, les droits et les devoirs citoyens." },
  { key: "relations",  title: "Chargé·e des Relations avec le Parlement et autres organes", short: "Relations", icon: "🔗", desc: "Fait le lien avec le Parlement national et les partenaires." }
];

/* Départements de la République du Congo (circonscriptions de vote).
   Vérifiez/ajustez cette liste selon le découpage officiel en vigueur. */
export const DISTRICTS = [
  "Brazzaville",
  "Pointe-Noire",
  "Bouenza",
  "Congo-Oubangui",
  "Cuvette",
  "Cuvette-Ouest",
  "Djoué-Léfini",
  "Kouilou",
  "Lékoumou",
  "Likouala",
  "Niari",
  "Nkéni-Alima",
  "Plateaux",
  "Pool",
  "Sangha"
];

export const UNICEF_LOGO_URL = "https://upload.wikimedia.org/wikipedia/commons/e/ed/Logo_of_UNICEF.svg";
