# Parlement des Enfants du Congo — Plateforme de vote

Plateforme web de vote pour l'élection du **Bureau exécutif national** du Parlement des Enfants
de la République du Congo, avec l'appui de l'UNICEF.
Hébergée sur Netlify · base de données Firebase Firestore (SDK modulaire v12).

## Pages

| Page | Rôle |
|---|---|
| `index.html` | Accueil : présentation, chiffres en direct, postes, droits de l'enfant |
| `vote.html` | Bureau de vote (borne) : choix de l'électeur par département, vote par poste avec confirmation |
| `podium.html` | Résultats en direct : podiums, classements, participation par département, mode projection |
| `admin.html` | Espace organisateurs (connexion obligatoire) : candidats, électeurs, résultats détaillés, exports |

Raccourcis : `/voter` → page de vote, `/resultats` → résultats.

## Structure

```
assets/css/app.css    Système de design (couleurs du drapeau + cyan UNICEF)
assets/js/config.js   ⚙️ Édition, postes, départements, configuration Firebase
assets/js/store.js    Accès aux données (Firebase ou mode démo)
assets/js/ui.js       Composants partagés (en-tête, avatars, notifications…)
firestore.rules       Règles de sécurité à publier dans Firebase
netlify.toml          En-têtes de sécurité et redirections
```

## ⚠️ Mise en service (à faire une fois dans la console Firebase)

La base refusait toutes les requêtes (« Missing or insufficient permissions ») :
les règles Firestore en mode test avaient expiré.

1. **Créer le compte administrateur** — Firebase Console → *Authentication* → *Sign-in method* →
   activer **E-mail/Mot de passe**. Puis *Users* → *Add user* (e-mail + mot de passe solide).
2. **Publier les règles** — *Firestore Database* → *Règles* : coller le contenu de `firestore.rules`,
   remplacer `REMPLACEZ-PAR-VOTRE-EMAIL-ADMIN@exemple.org` par l'e-mail de l'étape 1, puis **Publier**.
3. **Domaine autorisé** — *Authentication* → *Settings* → *Authorized domains* : vérifier que
   `parlementenfantvote.netlify.app` figure dans la liste (ajoutez aussi l'URL de prévisualisation Netlify pour tester).
4. Se connecter sur `admin.html`, vérifier les candidats et compléter le **département** des électeurs.

## Mode démonstration

Ajoutez `?demo=1` à n'importe quelle URL (ex. `vote.html?demo=1`) : données fictives stockées dans
le navigateur, rien n'est envoyé à Firebase. Idéal pour former les enfants avant le vote.
`?demo=0` pour revenir aux données réelles.

## Modèle de données (compatible avec l'ancienne version)

- `candidates` : `name`, `role` (`pres`, `vice`, `sec`, `rapporteur`, `secretaire`, `relations`), `district`, `slogan`, `imageUrl`
- `voters` : `name`, `district`
- `votes` : identifiant `<voterId>_<role>` (garantit un seul vote par poste), `voterId`, `voterName`,
  `candidateId`, `candidateName`, `role`, `district`, `ts`

## Personnaliser

Tout se règle dans `assets/js/config.js` : année de l'édition, intitulés des postes, liste des départements.
