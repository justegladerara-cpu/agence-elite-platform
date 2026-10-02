# Modèle de données du socle (Lot 1)

Conventions :
- Schéma `public`, noms en français, `snake_case`.
- Identifiants `uuid` (`gen_random_uuid()`), sauf pour les catalogues, qui utilisent un slug `text` (`^[a-z][a-z0-9_]*$`).
- Dates `timestamptz` : `cree_le` (défaut `now()`), et `modifie_le`, tenu à jour par un trigger.
- Aucune suppression physique en cascade : les clés étrangères sont en `on delete restrict`, sauf `profils` qui suit `auth.users`.
- RLS activée sur **toutes** les tables. Les politiques arrivent avec la tâche 002 ; d'ici là, tout est refusé à `anon` et `authenticated`.

## Catalogue
| Table | Colonnes | Contraintes |
|---|---|---|
| `solutions` | `id` slug PK, `nom`, `description`, `statut`, `cree_le` | statut ∈ `active, en_preparation, future, retiree` |
| `modules` | `id` slug PK, `nom`, `description`, `nature`, `statut`, `cree_le` | nature ∈ `socle, transversal, metier` ; statut ∈ `actif, en_preparation, futur, retire` |
| `module_dependances` | `module_id`, `depend_de` | PK (les deux) ; `module_id <> depend_de` |
| `solution_modules` | `solution_id`, `module_id`, `par_defaut` bool | PK (solution, module) |
| `roles` | `id` slug PK, `nom`, `description`, `ordre` int | gerant, responsable, employe, comptable, lecteur |
| `permissions` | `id` PK (`module.action`), `module_id`, `description` | `id ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'` et préfixe = `module_id` |
| `role_permissions` | `role_id`, `permission_id` | PK (les deux) |

## Éditeur, clients, établissements
| Table | Colonnes | Contraintes |
|---|---|---|
| `plateforme_admins` | `user_id` PK → auth.users, `role`, `actif`, `cree_le` | role ∈ `super_admin, support` |
| `clients` | `id`, `nom`, `pays`, `devise_facturation` (défaut `XAF`), `contact` jsonb, `statut`, dates | nom non vide ; statut ∈ `actif, suspendu, archive` |
| `client_membres` | `client_id`, `user_id`, `role`, `actif`, `cree_le` | PK (client, user) ; role ∈ `dirigeant, lecteur` |
| `etablissements` | `id`, `client_id`, `solution_id`, `nom`, `ville`, `pays`, `devise` (défaut `XAF`), `fuseau` (défaut `Africa/Brazzaville`), `statut`, dates | nom non vide ; statut ∈ `actif, suspendu, archive` ; **`solution_id` non modifiable** |
| `etablissement_modules` | `etablissement_id`, `module_id`, `actif` (défaut true), `active_le`, `active_par` → auth.users, `source`, `modifie_le` | PK (etab, module) ; source ∈ `inclus, licence, manuel` ; **le module doit être proposé par la solution de l'établissement** (trigger) |

## Membres et invitations
| Table | Colonnes | Contraintes |
|---|---|---|
| `profils` | `id` PK → auth.users (cascade), `nom_complet`, `telephone`, `langue` (défaut `fr`), dates | |
| `etablissement_membres` | `etablissement_id`, `user_id`, `role_id` → roles, `permissions_ajustees` jsonb (défaut `{}`), `actif`, dates | PK (etab, user) ; `permissions_ajustees` est un objet `{"permission": true/false}` |
| `invitations` | `id`, `email`, `etablissement_id`, `role_id`, `client_id`, `role_client`, `expire_le` (défaut +7 jours), `acceptee_le`, `annulee_le`, `cree_par`, `cree_le` | `email = lower(email)` ; soit (établissement + role_id), soit (client + role_client), jamais les deux ; une seule invitation en attente par email et par cible |

## Paramètres de l'établissement
| Table | Colonnes | Contraintes |
|---|---|---|
| `etablissement_identite` | `etablissement_id` PK, `nom_commercial`, `logo_url`, `couleur_principale`, `adresse`, `telephone`, `email`, `rccm`, `niu`, `mentions_recu`, `modifie_le` | couleur au format `#RRGGBB` |
| `etablissement_parametres` | `etablissement_id`, `module_id`, `data` jsonb, `modifie_le` | PK (etab, module) ; `data` est un objet |
| `points_de_vente` | `id`, `etablissement_id`, `nom`, `actif`, `cree_le` | nom unique dans l'établissement |
| `numerotations` | `etablissement_id`, `type` (slug), `prefixe`, `prochain_numero` (défaut 1, > 0), `modifie_le` | PK (etab, type) |

## Journaux (en ajout seul)
| Table | Colonnes | Contraintes |
|---|---|---|
| `evenements` | `id` bigint identity, `etablissement_id`, `client_id`, `type`, `acteur`, `donnees` jsonb, `cree_le` | UPDATE et DELETE refusés par trigger |
| `journal_audit` | `id` bigint identity, `table_nom`, `operation`, `ligne_id`, `etablissement_id`, `acteur`, `mode_support` bool, `avant`, `apres`, `cree_le` | operation ∈ `INSERT, UPDATE, DELETE` ; UPDATE et DELETE refusés par trigger |

## Données de départ (migration de catalogue)
- **Solutions** : `commerce` (en_preparation), `restaurant` (future), `hotel` (future).
- **Modules du socle** (nature `socle`, statut `actif`) : `etablissement`, `membres`, `tableau_de_bord`. Les modules `membres` et `tableau_de_bord` dépendent de `etablissement`.
- Chaque solution propose les trois modules du socle, avec `par_defaut = true`.
- **Rôles** : gerant (1), responsable (2), employe (3), comptable (4), lecteur (5).
- **Permissions** : `etablissement.lire`, `etablissement.modifier`, `membres.lire`, `membres.gerer`, `tableau_de_bord.lire`.
- **Droits par rôle** :
  - gerant : toutes.
  - responsable : les trois `lire`.
  - employe : `etablissement.lire`.
  - comptable et lecteur : `etablissement.lire`, `tableau_de_bord.lire`.
- Tables de la Solution Commerce (2026-10-02) : `categories_articles`, `articles`, `contacts`, `sessions_caisse`, `ventes`, `lignes_vente`, `paiements`, `mouvements_stock`, `depenses`, `clotures`, vue `stock_articles`. Règles et fonctions : `docs/COMMERCE.md`. Restaurant et Hôtel ne sont pas développés.

## Offres et licences (couche commerciale)
| Table | Colonnes | Contraintes |
|---|---|---|
| `offres` | `id` slug PK, `solution_id`, `nom`, `description`, `modules` text[], `prix_acquisition`, `prix_mise_en_service`, `prix_mensuel`, `prix_annuel`, `prix_support_mensuel`, `devise`, `offre_essai`, `actif`, `ordre` | modules proposés par la solution, dépendances incluses ; une seule offre d'essai par solution |
| `licences` | `id`, `etablissement_id`, `offre_id`, `formule`, `statut`, `debut`, `echeance`, `montant`, `devise`, `modules_supplementaires` text[], `support` bool (support séparé, ajouté ou retiré par `definir_support_licence`, tracé dans `licence_evenements`), `note`, `motif_statut`, dates | formule ∈ `essai, acquisition, mensuel, annuel` ; statut ∈ `active, suspendue, terminee` ; une seule licence non terminée par établissement ; écriture par fonctions éditeur uniquement |
| `licence_evenements` | `id`, `licence_id`, `etablissement_id`, `type`, `ancienne_echeance`, `nouvelle_echeance`, `montant`, `reference`, `motif`, `acteur`, `cree_le` | ajout seul (attribution, renouvellement, suspension, réactivation, fin) |

`etablissements.mis_en_service_le` : date de mise en service déclarée (une seule fois).

## Hubs, transferts, inventaires (migrations 11-12, 2026-10-02)
| Table | Colonnes | Contraintes |
|---|---|---|
| `hubs` | `id`, `etablissement_id`, `nom`, `code`, `type`, `capacite_vente/stock/caisse/transfert`, `principal`, `actif`, `adresse`, `telephone`, dates | type ∈ `point_de_vente, depot, mixte` ; un seul principal par établissement (créé automatiquement) ; le principal reste actif ; jamais supprimé |
| `membre_hubs` | `etablissement_id`, `user_id`, `hub_id` | aucune ligne pour un membre = accès à tous les Hubs |
| `transferts` / `lignes_transfert` | numéro, Hub source ≠ destination, statut `valide`/`annule`, motif d'annulation obligatoire | écriture par `transferer_stock` / `annuler_transfert` |
| `inventaires` / `lignes_inventaire` | Hub, numéro, quantités attendue / comptée | écriture par `enregistrer_inventaire` ; les écarts deviennent des mouvements |
| `hub_id` ajouté à | `points_de_vente`, `sessions_caisse`, `ventes`, `depenses`, `mouvements_stock`, `clotures` | rétro-rempli avec le Hub principal pour l'existant |
| Vue `stock_hubs` | `etablissement_id`, `hub_id`, `article_id`, `quantite` | `security_invoker` : respecte la RLS et l'accès Hub |

## Comptes et administration (migrations 10 et 13)
| Table | Colonnes | Contraintes |
|---|---|---|
| `comptes_connexion` | `user_id` → auth.users, `identifiant`, `doit_changer_mot_de_passe`, `temporaire_expire_le`, `mot_de_passe_change_le`, `cree_par`, dates | identifiant unique sans casse, 3-40 caractères `A-Z a-z 0-9 . _ -` ; **aucun mot de passe stocké** (Supabase Auth seul) |
| `plateforme_admins.role` | | ∈ `super_admin, admin, support` |
| `modules` / `solution_modules` | statut du module ; proposition par solution (`definir_proposition_module`) | modifiables dans le centre des modules |
