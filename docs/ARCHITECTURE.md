# Architecture du socle (validée par Juste le 2026-10-01 à 22:16)

## Principe
Une seule application et une seule base pour toutes les solutions. Une solution n'est pas une application : c'est une **configuration** (la liste des modules proposés). Un module est écrit une seule fois.

```
Agence Elite (éditeur : plateforme_admins)
└── Clients (clients) : ne portent aucune donnée métier
      └── Établissements (etablissements) : 1 client, 1 solution, unité d'isolement
            ├── Modules accordés / activés (etablissement_modules), choisis parmi ceux de la solution
            ├── Identité, paramètres, numérotations
            ├── Hubs (hubs) : lieux physiques (point de vente, dépôt, mixte), 1 principal
            │     └── Caisses (points_de_vente), stock par Hub (vue stock_hubs)
            ├── Membres (etablissement_membres) : rôle + permissions ajustées
            │     └── Accès Hub (membre_hubs) : aucune ligne = tous les Hubs
            └── Données métier : toujours avec etablissement_id (à partir du Lot 2)
Dirigeants (client_membres) : lecture sur tous les établissements d'un client
Licences (licences, licence_evenements) : couche séparée, figée par historique
Comptes de connexion (comptes_connexion) : identifiant → compte Supabase Auth
```

## Trois notions à ne jamais confondre
1. **Module proposé** : la solution le contient (`solution_modules`).
2. **Module accordé / activé** : il est ouvert pour un établissement (`etablissement_modules`). Plus tard, cet accord pourra venir d'une licence.
3. **Permission** : l'utilisateur a le droit d'agir (rôle + `permissions_ajustees`).

Un écran ou une écriture n'est autorisé que si les trois sont vrais.

## Règles
1. L'interface affiche seulement les modules activés de l'établissement actif. Il n'y a aucun build par solution ou par client.
2. L'isolation est faite par la base, avec RLS sur toutes les tables. Toute donnée d'établissement porte un `etablissement_id`, que la base vérifie et verrouille.
3. Le dirigeant n'a que la lecture. S'il est aussi membre d'un établissement, ses droits sont l'union des deux.
4. Le super admin n'accède aux données d'un établissement qu'en **mode support**. Ce mode est journalisé et en lecture seule par défaut.
5. Désactiver un module masque ses écrans sans supprimer ses données.
6. Les établissements sont créés par l'éditeur, jamais automatiquement à l'inscription.
7. Rien n'est supprimé physiquement : on utilise un statut (`suspendu`, `archive`).
8. Vocabulaire : un acheteur d'établissement est un **contact**, jamais un « client ». Le stock se calcule à partir des **mouvements**.

## Arborescence cible du code (créée progressivement)
```
supabase/migrations/   migrations versionnées (seule source du schéma)
tests/sql/             shim Supabase pour les tests (jamais en production)
tests/                 tests (vitest + PGlite)
src/noyau/             auth, contexte d'établissement, garde de permissions, registre des modules
src/editeur/           administration Agence Elite
src/client/            vue dirigeant
src/etablissement/     identité, paramètres, membres
src/solutions/         fichiers de configuration (commerce.js…), sans logique
src/modules/<id>/      un dossier par module : manifest (dépendances, permissions, écrans, tables)
```

## Hors périmètre
Le CRM Agence Elite (outil interne), le Kangourou en production (référence fonctionnelle en lecture seule), Elite Hôtel (archivé). Aucune donnée réelle n'est migrée.

## Interface (2026-10-02)
- Coquille unique : barre latérale groupée (Pilotage, Vente, Catalogue et stock, Relations, Organisation),
  barre du haut avec fil d'Ariane, sélecteur d'établissement, sélecteur de Hub (seulement en multi-Hub), profil.
- Espace Agence Elite routé par chemin (`#/editeur/clients/<id>`, `src/noyau/routes.js`) :
  tableau de bord, clients, établissements, Hubs, modules, comptes, offres.
- Composants partagés : `src/ui/composants.jsx` ; règles : `docs/DESIGN_SYSTEM.md` ; procédures : `docs/SOP/`.

## Plateforme modulaire et personnalisable (2026-10-02, migration 15)
- **Catalogue** : `solutions` (configurations), `modules` (statut, catégorie, icône, version, documentation,
  dépendances, capacités Hub, schéma de réglages), `categories_modules`, `solution_modules`, `module_dependances`.
- **Niveaux d'un module pour un établissement** : disponible (catalogue) → proposé (solution) → inclus (offre)
  → accordé (licence) → activé (`etablissement_modules`) → autorisé (permission). `mes_applications` les rend séparément.
- **Écran** : chaque module a un manifeste `src/modules/<module>/manifeste.js` (pages, widgets) ; `src/modules/index.js`
  les assemble (`PAGES`, `WIDGETS`, `pagesDuMenu`, `groupesDuMenu`, `widgetsAccessibles`).
- **Identité affichée** : `plateforme_identite` → `client_identite` → `etablissement_identite`, résolue par
  `identite_effective` (base) et appliquée par `src/noyau/marque.js` (variables CSS, titre, favicon).
- **Profils** : `profils` (prénom, nom, nom affiché, initiales, photo, fonction, préférences) via `enregistrer_mon_profil`.
