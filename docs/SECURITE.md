# Sécurité et règles d'accès

## Qui voit quoi
| Acteur | Lecture | Écriture |
|---|---|---|
| `anon` | rien | rien |
| Membre actif d'un établissement actif | les données de **son** établissement, pour les modules activés, selon ses permissions | selon ses permissions, si l'établissement est `actif` et le module activé |
| Dirigeant / lecteur d'un client | tous les établissements de ce client | rien (sauf via son éventuel rôle de membre) |
| Gérant | son établissement : identité, paramètres, membres | idem |
| Éditeur (`plateforme_admins`) | catalogue, clients, établissements, modules, membres (administration) | via des fonctions dédiées (tâche 004) |
| Éditeur en mode support | les données d'un établissement, **après ouverture d'une session support journalisée** (motif, 8 h) | non |

## Calcul d'une permission
Pour avoir la permission P (`module.action`) dans l'établissement E, il faut :
1. être membre actif de E ;
2. que E soit `actif`, que son client soit actif et que sa licence soit valide (sinon la lecture reste possible mais l'écriture est refusée) ;
3. que le module de P soit couvert par la licence et activé pour E ;
4. que P soit dans le rôle, sauf si `permissions_ajustees` la retire (`false`) ; ou qu'elle soit ajoutée par `permissions_ajustees` (`true`).

## Règles techniques
- RLS est activée sur toute table de `public`, et chaque politique s'appuie sur des fonctions `security definer` avec un `search_path` fixé.
- `etablissement_id` ne change jamais après la création d'une ligne. `solution_id` d'un établissement ne change jamais.
- Un module ne s'active pour un établissement que s'il est proposé par sa solution et que ses dépendances sont actives.
- Toute écriture sensible est inscrite dans `journal_audit`, avec l'acteur et le drapeau `mode_support`.
- Aucun secret dans le dépôt. Les tests tournent sur une base locale (PGlite), jamais sur une base distante.
- Équipe : rôle attribué ≤ rôle de celui qui l'attribue ; pas de modification de son propre accès ; au moins un gérant actif ; `membres.gerer` donné à un non-gérant par Agence Elite seulement.
- Licences, offres et historique : écriture réservée aux super administrateurs, historique en ajout seul.
- Droits retirés à tous : `TRUNCATE`, `TRIGGER`, `REFERENCES`, séquences ; `anon` n'exécute aucune fonction, sauf `resoudre_connexion` (traduit un identifiant en adresse de connexion, réponse identique si l'identifiant est inconnu ou le mot de passe faux, blocage après 5 échecs).
- Images (logo, photo, justificatif) : `data:image/…` ou `https://` uniquement.
- En ligne : connexion à un Supabase hébergé seulement si `VITE_AUTORISER_SUPABASE_DISTANT=oui` ; en-têtes de sécurité dans `public/_headers` ; secrets dans l'environnement GitHub `production`, jamais dans le dépôt.

## Hubs (2026-10-02)
- Un membre limité à certains Hubs (`membre_hubs`) ne lit que les caisses, ventes, dépenses, clôtures, mouvements et stock de ces Hubs : filtré par RLS.
- Toute RPC qui touche un Hub vérifie l'accès au Hub (un transfert : accès aux deux Hubs).
- Hubs, transferts et inventaires ne se suppriment jamais ; un transfert s'annule avec motif.

## Comptes (2026-10-02)
- Supabase Auth reste le seul gardien des mots de passe ; aucune table applicative n'en contient.
- Mot de passe temporaire : expiré après la date fixée, et tant qu'il n'est pas remplacé la base refuse toute donnée métier (`doit_changer_mot_de_passe`).
- Mots de passe faibles (dont `1234`) refusés comme mot de passe définitif par la base ; 8 caractères minimum, une lettre et un chiffre contrôlés à l'écran.
- Rôles plateforme : Super Admin (tout : tarifs, catalogue des modules, administrateurs) ; Admin (clients, établissements, licences, Hubs, comptes, support, mais pas les tarifs, le catalogue ni les administrateurs) ; Support (rôle réservé, sans droit d'administration pour l'instant).

## Personnalisation, profils, catalogue (2026-10-02)
- Couleurs : palette fixe vérifiée par la base ; textes courts sans `<` ni `>` ; images `data:image` ou `https` seulement.
- `marque_connexion` est la seule nouvelle fonction appelable sans connexion : elle ne renvoie que nom, logo, favicon,
  couleur (jamais NIU, adresse, ni l'existence d'un client inactif).
- Apparence d'un établissement par le client : `etablissement.modifier` **et** autorisation d'Agence Elite (`personnalisation_client`).
- Profil : seule la préférence `page_accueil` est acceptée ; modifier son profil ne change ni rôle ni droits
  (testé : `tests/personnalisation_catalogue.test.js`).
- Catalogue : modifications réservées au Super Admin ; un module non programmé ne peut être déclaré disponible ;
  un module non disponible ne peut être vendu, accordé ni activé (déclencheur `etablissement_modules_disponible`) ;
  dépendances circulaires refusées ; réglages validés contre le schéma déclaré.

## Modules métier (2026-10-03)
- Chaque module : permissions `<module>.lire/…` vérifiées dans la base (`exiger_permission`, `lecture_autorisee`),
  module et licence actifs exigés, isolation par établissement testée (un gérant d'un autre établissement est refusé).
- Fonctions appelables sans connexion (liste fermée, testée par `tests/audit_offensif.test.js`) : `marque_connexion`,
  `resoudre_connexion`, `boutique_publique`, `verifier_coupon_boutique`, `commander_boutique`, `suivi_commande_boutique`,
  `site_public`, `envoyer_message_site`. Elles ne renvoient que des données publiées et limitent les envois (anti-abus).
- Site web : aucun code du client (blocs et champs connus seulement, liens `https/tel/mailto/page`, images filtrées).
- Données financières (ventes, paiements, factures, périodes d'abonnement, mouvements de fidélité, pointages) :
  jamais supprimées ; annulation avec motif. Suspension ou expiration de licence : rien n'est effacé, tout revient à la réactivation.
- Données RH sensibles dans `rh_employes_prives` (lecture réservée à `rh_employes.confidentiel` et à l'employé lui-même).

## Pages d'authentification (2026-10-03)
- Tables `pages_auth` et `pages_auth_journal` : RLS active, aucun accès direct (lecture et écriture par fonctions seulement) ; journal en ajout seul.
- Écriture : Super Admin pour la plateforme, équipe Agence Elite pour client et établissement. Lecture publique : `pages_connexion` renvoie le contenu **publié** (jamais le brouillon), l'identité affichée et rien d'autre.
- Validation par liste blanche (`champs_pages_auth`) : pas de `<` `>`, images data:image (png/jpeg/gif/webp) ou https sans guillemets ni parenthèses, liens https/mailto/tel, couleurs de palette, choix fermés. Rendu React en texte ; l'image de fond est revérifiée côté écran.
- Rien n'y règle l'authentification : politique des mots de passe, changement obligatoire, RLS, redirections. L'adresse de retour du lien « mot de passe oublié » = adresse de l'application, vérifiée par Supabase.

## Restaurant en service et catégories (2026-10-05)
- `rest_affectations`, `rest_transferts_serveur` : RLS active, lecture seulement avec `restaurant_salle.lire` (ou cuisine)
  **et** le Hub autorisé ; aucune écriture directe ; pas de suppression ni de vidage ; audit par déclencheur.
  Une affectation ne fait que se terminer ; un transfert ne se modifie jamais.
- Affecter / changer / retirer un serveur : `restaurant_salle.affecter` + accès au Hub de la table ; le serveur choisi doit
  être membre actif, avoir `restaurant_salle.servir` et l'accès au Hub (`membre_peut_servir`, interne).
- Transférer une commande ouverte à un autre serveur : `restaurant_salle.transferer`, motif obligatoire, trace immuable.
- Statistiques par serveur : sans `restaurant_salle.performances` (ou dirigeant / support), un membre ne reçoit que sa
  propre ligne — le filtre est fait dans la fonction, pas dans l'écran.
- Catégories : `articles.categories` (accordée aux rôles qui avaient `articles.gerer`) ; une catégorie contenant des
  articles en vente ne s'archive pas sans destination ; aucune catégorie ne se supprime.
- `serveurs_restaurant` expose nom affiché ou identifiant, jamais l'e-mail.
- Import de catalogue : `articles.gerer` sur l'établissement visé, rapport nommant l'établissement de destination,
  confirmation explicite à l'écran, événement `articles.import_catalogue` ; jamais de stock.

## Données personnelles et liens de partage (lot F, 2026-10-10, migration `20261010000116_donnees_personnelles.sql`)
- **Export d'un contact** (`exporter_donnees_contact`) : droit `contacts.donnees_personnelles` (gérant seulement). Les
  tables exportées sont trouvées dans le catalogue (colonnes `contact_id` ou `fournisseur_id` et `etablissement_id`),
  filtrées sur l'établissement du contact ; justificatifs exclus. Chaque export écrit un événement `contact.export`.
- **Anonymisation** (`anonymiser_contact`) : même droit, motif obligatoire, refusée tant qu'une facture reste à payer
  ou qu'un crédit, un abonnement, un contrat ou une location est en cours. Champs effacés : liste fermée
  `champs_personnels(table)` (interne) ; ailleurs, `nom` ou `adresse` désignent autre chose et ne sont pas touchés.
  Registre `anonymisations` (immuable, sans donnée personnelle).
- **Journal d'audit** : toujours en ajout seul. Seule exception : pendant `anonymiser_contact` (réglage de
  transaction `app.anonymisation_en_cours`, posé uniquement par cette fonction et invisible pour un client de l'API),
  les clés personnelles de `avant`/`apres` des lignes touchées sont retirées ; table, opération, ligne, acteur et date
  ne peuvent pas changer. Même règle pour `mkt_destinataires` (figés sauf `nom` et `coordonnee` dans ce cas).
- **Liens de partage** (`liens_partage`) : jeton de 64 caractères hexadécimaux (deux `gen_random_uuid`), renvoyé une
  seule fois ; seule l'empreinte SHA-256 est stockée. Création et révocation : droit d'écriture du type d'objet de la
  pièce. Durée 1 h à 30 jours. Refusé pour un document confidentiel. `ouvrir_lien_partage` (anonyme) donne le même
  message pour un lien inconnu, expiré, révoqué, un document archivé ou un établissement suspendu ; il compte les
  ouvertures.

Limites connues : le texte libre (notes d'activités CRM, messages de tickets, notifications déjà envoyées) peut encore
citer la personne ; il n'est pas réécrit. Les locataires du module Immobilier (`immo_locataires`) ont leur propre
fiche, non couverte. Les sauvegardes déjà faites gardent les anciennes données jusqu'à leur rotation. Pas de limite
du nombre d'ouvertures d'un lien. Double authentification des administrateurs, liste des appareils connectés et
révocation des sessions : pas encore faits (lot F2), ils dépendent des réglages d'authentification de la base de
production, à vérifier avec Juste.
