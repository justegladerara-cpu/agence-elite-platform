# Sites clients rattachés

Un **site client** est une application réalisée par Agence Elite pour un client et hébergée **à part** (son propre
Worker Cloudflare, sa propre base). Exemple : **Express Congo** (fret France → Congo : site public, devis, suivi,
logiciel de gestion des agences), code dans **ce dépôt**, dossier `sites-clients/express-congo`.

Les sites clients sont rangés dans `sites-clients/<site>/` : chacun a son `package.json`, ses tests et son propre
Worker Cloudflare. Ils sont exclus des tests de la plateforme (`vitest.config.js`) et vérifiés par leur propre
workflow (`.github/workflows/<site>.yml`). Le build de la plateforme ne les touche pas.

## Ce que fait le Super Admin (menu « Sites clients », `#/editeur/sites`)

- État du site : comptes, sessions ouvertes, expéditions, devis, moyens de paiement, démo publique, dernière activité.
- **Comptes et rôles** : créer un compte (rôle + agence) → un lien d'activation à transmettre (72 h, usage unique ;
  la personne choisit son mot de passe, le Super Admin ne le connaît jamais) ; changer le rôle ou l'agence ;
  désactiver / réactiver (accès coupé immédiatement) ; créer un lien de nouveau mot de passe ; fermer les sessions.
- **Accès** : ouvrir ou fermer la démonstration publique (comptes fictifs dont le mot de passe est affiché).
- **Journal** : 60 dernières actions du site, sans contenu personnel. Les actions faites depuis la plateforme
  apparaissent comme « adresse (plateforme) ».
- **Ouvrir la gestion** : ouvre le logiciel du site, connecté en administrateur, avec un lien valable 60 secondes.

Réservé au rôle `super_admin` (le menu est masqué aux autres, et le site refuse de toute façon).

## Sécurité : aucun secret partagé

1. L'écran appelle `https://<site>/api/plateforme/<chemin>/` depuis le navigateur avec le **jeton de session
   Supabase** de la personne connectée (`api.jeton()`).
2. Le site n'accepte que les origines de la plateforme (`saas.agence-elite.fr`, `*.agence-elite.fr`,
   `agence-elite-saas.pages.dev`, `agence-elite-platform.justegladerara.workers.dev`).
3. Le site appelle la fonction **`est_super_admin()`** de la base de production avec ce jeton et la clé
   *publishable* (publique) : seule la base décide. Aucune clé `service_role`, aucune migration, aucun secret.
4. La CSP de la plateforme (`public/_headers`, `connect-src`) autorise l'adresse du site ; un test le vérifie.

## Ajouter un site

1. Le site expose `/api/plateforme/{etat,comptes,journal,acces,session}/` avec le contrôle ci-dessus
   (modèle : `sites-clients/express-congo/src/server/platform.ts`).
2. Ajouter l'entrée dans `src/noyau/sites.js` et son adresse dans `connect-src` de `public/_headers`.
3. `npm test` (test `tests/sites_clients.test.jsx`), `npm run build`.
