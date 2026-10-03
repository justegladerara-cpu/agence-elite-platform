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

## Identité, profils, catalogue (migration 15, 2026-10-02)
| Table / colonne | Rôle |
|---|---|
| `plateforme_identite` (1 ligne) | Nom, nom court, sous-titre, logo, favicon, couleur de la plateforme |
| `client_identite` | Identité du client + infos société (nom commercial, adresse, téléphone, e-mail, RCCM, NIU), mentions et pied des documents, `adresse_connexion`, `personnalisation_client` |
| `etablissement_identite` + `nom_logiciel`, `nom_court`, `sous_titre`, `favicon_url`, `couleur_accent`, `pied_documents` | Surcharge par établissement |
| `profils` + `prenom`, `nom`, `nom_affiche`, `initiales`, `avatar_url`, `fonction`, `preferences` | Profil de la personne (aucun droit) |
| `categories_modules` | Catégories du catalogue (19) |
| `modules` + `icone`, `documentation`, `capacites_hub`, `parametres_schema` ; statut `beta` | Fiche complète d'un module |
| `solutions` + `icone`, `ordre` ; nouvelles : `rh`, `ecommerce`, `services` (Prévues) | Solutions |

Fonctions : `identite_effective`, `marque_connexion` (anonyme, nom/logo/couleur seulement), `enregistrer_identite_plateforme`,
`enregistrer_identite_client`, `enregistrer_apparence_etablissement`, `enregistrer_mon_profil`, `enregistrer_solution`,
`enregistrer_categorie_module`, `editeur_catalogue`, `editeur_identite_client`, `mes_applications` ; `enregistrer_module`,
`enregistrer_parametres_module`, `verifier_modules_offre`, `mon_contexte`, `recu_vente` remplacées.

## Modules métier (migrations 16 à 22 du 2 octobre, 1 à 8 du 3 octobre)
Chaque module a sa documentation (colonnes, règles, fonctions) ; ici, la carte des tables. Toutes portent
`etablissement_id` verrouillé, RLS en lecture par permission, écriture par fonctions, suppression interdite, audit.
| Module | Tables |
|---|---|
| Socle transversal | `notifications`, `pieces_jointes`, `types_pieces_jointes`, `fichiers`, `documents_dossiers` |
| RH ([RH](RH.md)) | `rh_departements`, `rh_postes`, `rh_employes`, `rh_employes_prives`, `rh_contrats`, `rh_horaires`, `rh_creneaux`, `rh_jours_feries`, `rh_pointages`, `rh_absences`, `rh_ajustements_conges` |
| Facturation ([FACTURATION](FACTURATION.md)) | `documents_vente`, `lignes_document_vente` (facture émise → `ventes` origine `facture`) |
| Achats ([ACHATS](ACHATS.md)) | `commandes_achat`, `lignes_commande_achat`, `receptions_achat`, `lignes_reception_achat`, `paiements_fournisseur` |
| CRM ([CRM](CRM.md)) | `crm_etapes`, `crm_opportunites`, `crm_activites` |
| Projets ([PROJETS](PROJETS.md)) | `projets`, `projet_taches`, `projet_temps` |
| Restaurant ([RESTAURANT](RESTAURANT.md)) | `rest_tables`, `rest_commandes`, `rest_lignes` |
| Hôtel ([HOTEL](HOTEL.md)) | `hotel_types_chambre`, `hotel_chambres`, `hotel_reservations`, `hotel_prestations` |
| E-commerce ([ECOMMERCE](ECOMMERCE.md)) | `boutiques`, `boutique_articles`, `boutique_coupons`, `boutique_commandes`, `boutique_lignes` |
| Site web ([SITE_WEB](SITE_WEB.md)) | `sites`, `site_pages`, `site_messages` |
| Agenda ([AGENDA](AGENDA.md)) | `agenda_rendez_vous` |
| Support ([SUPPORT](SUPPORT.md)) | `support_tickets`, `support_messages` |
| Abonnements ([ABONNEMENTS](ABONNEMENTS.md)) | `abo_formules`, `abonnements`, `abonnement_periodes` |
| Rapports ([RAPPORTS](RAPPORTS.md)) | aucune (fonction `rapport_ventes`) |
| Fidélité ([FIDELITE](FIDELITE.md)) | `fidelite_mouvements` |
`ventes.origine` ∈ `caisse, facture, boutique, restaurant, hotel, abonnement`.
