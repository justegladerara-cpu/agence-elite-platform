# Solution Commerce

La première solution du socle : boutique, quincaillerie, magasin. Kangourou a servi de référence fonctionnelle (lecture seule, aucune donnée reprise).

## Parcours couvert
Créer un article → enregistrer du stock → ouvrir la caisse → vendre → stock diminué → paiement (un ou plusieurs modes, crédit client) → reçu → retrouver la vente → annuler avec motif si besoin → clôturer avec le ticket Z → contacts → dépenses → tableau de bord.

## Modules
| Module | Écran | Permissions |
|---|---|---|
| articles | Articles | `articles.lire`, `articles.gerer` |
| stock | Stock (niveaux, mouvements, « J'ai reçu de la marchandise », « Je compte mon stock », fichier de stock, retrait) | `stock.lire`, `stock.ajuster` |
| caisse | Caisse (POS plein écran) | `caisse.utiliser` |
| ventes | Ventes (liste, détail, annulation) | `ventes.lire`, `ventes.annuler` |
| paiements | dans Caisse et Ventes | `paiements.lire`, `paiements.encaisser`, `paiements.annuler` |
| recus | reçu 80 mm imprimable | `recus.lire` |
| cloture | Clôtures et tickets Z | `cloture.lire`, `cloture.effectuer` |
| contacts | Contacts (clients, fournisseurs, dettes) | `contacts.lire`, `contacts.gerer` |
| depenses | Dépenses (justificatif photo, validation au-dessus d'un seuil) | `depenses.lire`, `depenses.gerer`, `depenses.valider` |
| tableau_de_bord | Tableau de bord | `tableau_de_bord.lire` |

Rôles par défaut : gérant et responsable ont tout ; employé (caissier) vend, encaisse et gère les contacts ; comptable lit tout et gère les dépenses ; lecteur lit. Le détail est dans `supabase/migrations/20261002000002_commerce_catalogue.sql`.

## Règles métier
- **Écriture uniquement par fonctions RPC** (`security definer`, `search_path` vide). Les tables n'ont que des politiques de lecture pour `authenticated`. Chaque RPC vérifie la permission, le module actif, l'établissement et son client actifs, et l'appartenance de chaque objet cité au même établissement.
- **Stock = somme des mouvements** (`entree`, `sortie_vente`, `retour_annulation`, `ajustement`, `inventaire`). On ne modifie jamais un stock directement. Le stock négatif est refusé sauf réglage `stock_negatif` de la caisse.
- **Saisie du stock en lot** (`saisir_stock`, SOP 75) : réception (mouvements `entree`) ou comptage (inventaire) sur plusieurs articles en une fois, tout ou rien ; une ligne désigne un article par id, référence ou nom (code-barres facultatif) ; un article inconnu d'un fichier est créé (prix de vente obligatoire, catégorie créée au besoin, droit `articles.gerer`). Modèle : `docs/modele_stock.csv`.
- **Vente atomique** : lignes, sortie de stock, paiements et numéro `V-00001` dans une seule transaction.
- **Rien n'est effacé ni modifié en silence** : suppression interdite sur toutes les tables commerce ; une vente validée ne change que par annulation (motif obligatoire) ou encaissement ; paiements et dépenses ne s'annulent qu'avec un motif ; lignes, mouvements et tickets Z sont figés. Tout passe dans `journal_audit`.
- **Annulation d'une vente** seulement tant que sa session de caisse est ouverte : le ticket Z déjà édité reste juste. Elle remet le stock (mouvement `retour_annulation`) et annule les paiements.
- **Espèces** : le paiement est enregistré net de la monnaie rendue. Un encaissement en espèces exige une session ouverte.
- **Crédit** : une vente non soldée exige un contact ; le reste se règle plus tard depuis Ventes.
- **Fin de journée de caisse** (SOP 76, migration `20261010000124`) : réglage Clôture `fermeture_automatique` (HH:MM locale, `00:00` par défaut, vide = jamais). Une caisse ouverte avant la dernière heure de fin est fermée par `fermer_caisses_echues` (pg_cron toutes les 5 min en production, et à l'ouverture de la caisse ou de l'écran Clôture) avec un ticket Z `automatique`, espèces comptées ensuite une fois (`compter_cloture`). Un déclencheur refuse toute vente, paiement, dépense ou retour sur une caisse échue.
- **Casiers** (SOP 78, migration `20261010000126`) : `articles.unites_par_lot` (2 à 10 000) et `nom_lot`, réglés par `regler_lot_article` (`articles.gerer`) ; `saisir_stock` accepte `lots` (casiers) et `par_lot` en plus de `quantite`, stock toujours en unités.
- **Ventes d'un jour passé** (SOP 77, migration `20261010000125`, droit `caisse.rattraper`) : `saisir_ventes_passees` ouvre une caisse `rattrapage` datée du jour, enregistre chaque vente par `enregistrer_vente` (dates fixées par `instant_saisie()`, réglage local de transaction), puis la ferme avec un ticket Z daté de ce jour. Tout ou rien, 31 jours au plus, motif obligatoire.
- **Ticket Z** (`Z-00001`) : espèces attendues = fond + espèces encaissées − dépenses payées en caisse ; l'écart avec le comptage est figé.
- **Tableau de bord** : chiffre d'affaires, panier moyen, encaissé par mode, dépenses, marge brute (prix − coût d'achat, coût inconnu = 0), résultat estimé, crédits à encaisser, ventes par jour, meilleures ventes, stock bas.

## Fonctions (RPC)
`mon_contexte`, `enregistrer_identite`, `enregistrer_point_de_vente`, `enregistrer_parametres_module`, `enregistrer_categorie`, `enregistrer_article`, `ajuster_stock`, `ouvrir_caisse`, `enregistrer_vente`, `annuler_vente`, `encaisser_paiement`, `annuler_paiement`, `recu_vente`, `apercu_cloture`, `cloturer_caisse`, `enregistrer_contact`, `enregistrer_depense`, `annuler_depense`, `tableau_de_bord_commerce`. Définitions : `supabase/migrations/20261002000004_commerce_fonctions.sql`.

## Faire tourner l'application
```
npm install
npm run dev
```
Sans variables d'environnement, l'application démarre en **mode local** : une vraie base Postgres (PGlite) tourne dans le navigateur, construite avec les mêmes migrations que Supabase, et se remplit d'une démo fictive (Quincaillerie Démo à Pointe-Noire, un second magasin à Brazzaville). On choisit un profil à l'écran de connexion : gérante, caissier ou comptable. « Réinitialiser la démo » efface la base du navigateur.

Avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Supabase local uniquement pour l'instant), l'application utilise Supabase et une connexion par e-mail.

## Vérifier
- `npm test` : migrations, sécurité, isolation entre établissements, parcours commerce complet, moteur local, interface.
- `npm run build` puis `npx vite preview --port 4173` et `node scripts/parcours_navigateur.cjs` (Playwright) : parcours complet dans Chromium avec captures dans `captures-parcours/`.

## Exploitation par Agence Elite
- Espace éditeur (clients, établissements, licences, modules, équipe, mise en service, support) : `docs/PROCESSUS_CLIENT.md`.
- Prise en main par rôle : `docs/GUIDE_UTILISATEUR.md` ; modèle d'import : `docs/modele_import_articles.csv` ; modèle de stock : `docs/modele_stock.csv`.
- Mise en ligne, sauvegardes, retour arrière : `docs/PRODUCTION.md`.

## Pas encore fait
- Mise en ligne réelle : projet Supabase dédié et projet Cloudflare Pages à créer par Agence Elite (voir `docs/PRODUCTION.md`).
- Envoi automatique des invitations par e-mail : pour l'instant, message à copier (WhatsApp, SMS, e-mail).
- Facturation automatique des licences : les paiements sont notés à la main (montant, référence).
- Fonctionne hors connexion uniquement en mode local ; pas de synchronisation.
## Retours partiels et remboursements

Une vente validée reste définitive. Depuis sa fiche, un responsable utilise **Retour / échange**, choisit les lignes et
quantités réellement rapportées, puis le mode de remboursement. La base applique les remises du ticket, empêche de retourner
plus que vendu, remet le stock dans le Hub d'origine et conserve un document `RET-…`. Un remboursement en espèces exige la
caisse ouverte du Hub et est déduit du ticket Z. **Avoir / échange** trace la valeur rendue sans prétendre à une sortie bancaire.

## Ventes en attente, plafond de remise, ticket X (2026-10-09)

- **Mettre en attente** (panier de la caisse) : le panier est mis de côté avec un nom facultatif (« Table 4 »,
  « Monsieur en bleu ») ; la caisse est libre pour le client suivant. **En attente (n)** liste les paniers du Hub :
  **Reprendre** les remet dans la caisse (prix relus au moment de l'encaissement, article archivé entre-temps ignoré),
  **Abandonner** les clôt. Rien n'est vendu ni sorti du stock tant que la vente n'est pas encaissée. 20 paniers au
  plus par caisse. Table `ventes_en_attente`, fonctions `mettre_vente_en_attente` et `terminer_vente_en_attente`
  (droit `caisse.utiliser`, Hub vérifié, aucune suppression, journal d'audit).
- **Plafond de remise** (Paramètres › Réglages des modules › Caisse, « Remise maximale sans autorisation ») : 100 %
  par défaut, donc aucune limite. Au-delà du plafond, la vente est refusée à qui n'a pas le droit
  `caisse.remise_libre` (gérant et responsable l'ont). Remises de ligne et remise globale sont additionnées. Contrôle
  dans la base, à la validation de la vente (déclencheur `ventes_plafond_remise`) : il vaut aussi pour la Salle.
- **Ticket X** et **comptage par coupures** : voir [SOP 29](SOP/29_CLOTURE_DE_CAISSE.md).

### Limites connues
- Pas de validation à distance : au-delà du plafond, un responsable doit se connecter sur le poste pour encaisser.
- Une vente en attente n'est pas réservée : le stock peut partir avant sa reprise (contrôlé à l'encaissement).
- Les coupures sont une aide à la saisie : seul le total compté est gardé dans le ticket Z.
- Migration `20261010000102_caisse_attente_remise.sql` ; tests `tests/caisse_confort.test.js`,
  `tests/caisse_ecrans.test.jsx`, parcours navigateur `caisse-attente`, `cloture`, `ticket-x`.

## Validation des dépenses (lot E, migration `20261010000115_tresorerie.sql`)
Réglage du module Dépenses « Dépense hors caisse à faire valider à partir de » (`seuil_validation`, 0 = jamais, par
défaut). Au-delà, une personne sans `depenses.valider` (donné au gérant et au responsable) **envoie la dépense en
validation** (`demander_depense`, table `demandes_depense`) : elle n'est pas comptée, ni dans les rapports ni en
comptabilité. Les personnes habilitées sont prévenues et voient « Demandes de dépense » en haut de l'écran
Dépenses : **Valider** crée la vraie dépense à la date demandée (`decider_demande_depense`), **Refuser** demande un
motif ; la personne qui a demandé est prévenue. On ne valide jamais sa propre demande. Une dépense prise dans le
tiroir d'une caisse ouverte n'est pas concernée (l'argent est déjà sorti, le ticket Z la compte).

Limites connues : un seul niveau de validation et un seul seuil par établissement (pas par catégorie) ; une
demande refusée ne se modifie pas, on en refait une.

## Données personnelles (lot F)
Sur la fiche d'un contact, le gérant voit **Exporter ses données** (fichier JSON de tout ce qui le concerne) et
**Anonymiser** (sur demande de la personne, irréversible, refusé tant que quelque chose est en cours avec elle).
Détail et limites : `docs/SECURITE.md` (section lot F) et SOP 69.
