# État du projet (mis à jour le 2026-10-02)

## En production
| Élément | État |
|---|---|
| Site | https://agence-elite-platform.justegladerara.workers.dev (Cloudflare, publié à chaque push sur `main`) |
| Base | Supabase `xrlfedosaqtffraadmgk` (eu-west-3), migrations 1 à 15 appliquées (dernière `20261002000015`) |
| Solution | Commerce : caisse, ventes, paiements, reçus, clôtures (ticket Z), dépenses, articles, stock, contacts |
| Multi-Hub | Hubs (point de vente, dépôt, mixte), stock par Hub, transferts, inventaires, accès par Hub |
| Comptes | Supabase Auth ; connexion par identifiant ou e-mail ; mot de passe temporaire à remplacer |
| Espace Agence Elite | tableau de bord, clients, établissements, Hubs, catalogue (modules, solutions, catégories, identité), comptes, offres et prix |
| Personnalisation | identité affichée par client / établissement (palette contrôlée), écran de connexion `#/connexion/<adresse>` |
| Profils | Mon profil (photo, nom, fonction, page d'accueil) ; Paramètres à onglets ; page Applications (5 niveaux) |
| Catalogue | 12 modules Disponibles (Commerce), 13 modules Prévus (architecture seulement), 6 solutions dont 1 en service |
| Sauvegarde | chiffrée chaque nuit + vérification de restauration |
| Clients réels | aucun pour l'instant ; client visible : « Commerce Démo » (fictif) ; pilotes archivés |

## Comptes Agence Elite
`contact@agence-elite.fr` (identifiant `Justegladerara`, Super Admin) ; `Admin` (Admin, mot de passe temporaire).
Comptes démo : `Patrondemo`, `Userdemo` ([SOP 30](SOP/30_DEMO_COMMERCIALE.md)).

## Qualité
- 210 tests (PGlite) ; CI : Supabase neuf, démo rejouée 2 fois, pilote API, parcours mot de passe sur Auth réel,
  sauvegarde/restauration comparée.

## Pas encore fait
- Nom commercial de la plateforme (à décider par Juste).
- Domaine personnalisé (ex. `app.agence-elite.fr`).
- Longueur minimale du mot de passe côté serveur Auth (réglage du tableau de bord Supabase) : la règle
  8 caractères est contrôlée à l'écran ; `1234` et les mots faibles sont refusés par la base.
- Solutions Hôtel, Restaurant, RH, E-commerce, Services : déclarées au catalogue (Prévues), aucun écran (volontairement). Voir SOP 33 et 42.
