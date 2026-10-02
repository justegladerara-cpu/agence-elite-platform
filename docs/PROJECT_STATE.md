# État du projet (mis à jour le 2026-10-02)

## En production
| Élément | État |
|---|---|
| Site | https://agence-elite-platform.justegladerara.workers.dev (Cloudflare, publié à chaque push sur `main`) |
| Base | Supabase `xrlfedosaqtffraadmgk` (eu-west-3), migrations 1 à 13 appliquées (dernière `20261002000013`) |
| Solution | Commerce : caisse, ventes, paiements, reçus, clôtures (ticket Z), dépenses, articles, stock, contacts |
| Multi-Hub | Hubs (point de vente, dépôt, mixte), stock par Hub, transferts, inventaires, accès par Hub |
| Comptes | Supabase Auth ; connexion par identifiant ou e-mail ; mot de passe temporaire à remplacer |
| Espace Agence Elite | tableau de bord, clients, établissements, Hubs, modules, comptes, offres et prix |
| Sauvegarde | chiffrée chaque nuit + vérification de restauration |
| Clients réels | aucun pour l'instant ; client visible : « Commerce Démo » (fictif) ; pilotes archivés |

## Comptes Agence Elite
`contact@agence-elite.fr` (identifiant `Justegladerara`, Super Admin) ; `Admin` (Admin, mot de passe temporaire).
Comptes démo : `Patrondemo`, `Userdemo` ([SOP 30](SOP/30_DEMO_COMMERCIALE.md)).

## Qualité
- 188 tests (PGlite) ; CI : Supabase neuf, démo rejouée 2 fois, pilote API, parcours mot de passe sur Auth réel,
  sauvegarde/restauration comparée.

## Pas encore fait
- Nom commercial de la plateforme (à décider par Juste).
- Domaine personnalisé (ex. `app.agence-elite.fr`).
- Longueur minimale du mot de passe côté serveur Auth (réglage du tableau de bord Supabase) : la règle
  8 caractères est contrôlée à l'écran ; `1234` et les mots faibles sont refusés par la base.
- Solutions Hôtel / Restaurant : non commencées (volontairement).
