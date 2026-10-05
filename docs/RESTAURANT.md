# Module Restaurant — salle et cuisine, solution « Restaurant »

Statut : **actif** (migration `20261002000022_restaurant.sql`, modules `restaurant_salle` et `restaurant_cuisine`).
La solution **Restaurant** devient active : offre d'essai `restaurant-complet` (articles, stock, caisse, ventes,
paiements, reçus, ticket Z, contacts, dépenses, salle, cuisine) créée **à prix 0** — Agence Elite fixe les prix dans
son espace avant toute vente. Les deux modules sont aussi proposés dans la solution Hôtel (restaurant de l'hôtel = un Hub).

## Principe (réutilise les briques communes)
Restaurant → Commande → Caisse → Paiement → Stock : aucune caisse ni aucun stock propres au restaurant.
- **Tables** (`rest_tables`) : nom, zone libre (Salle, Terrasse, VIP…), places, rattachées à un **Hub qui vend**.
- **Commande** (`rest_commandes`, CM-) : sur une table (une seule commande ouverte par table) ou **à emporter**,
  couverts (paramètre `couverts_obligatoires`), serveur, statut ouverte → encaissée / annulée (motif).
- **Plats** (`rest_lignes`) : article de la carte, quantité, note (« sans piment »), poste copié de l'article.
  À envoyer → Envoyé → En préparation → Prêt → Servi ; Annulé (motif) possible tant que non encaissé.
  Un plat sans poste (« servi directement » : bouteille, dessert prêt) est servi dès l'envoi.
- **Poste de préparation** : colonne `articles.poste_preparation` (aucun, cuisine, bar).
- **Addition** : `encaisser_commande_restaurant` appelle `enregistrer_vente` (mêmes contrôles : caisse ouverte du
  Hub de la commande, stock, paiements, crédit avec contact) puis marque la vente `origine = 'restaurant'`.
  Addition séparée : on coche les plats d'un client ; « Séparer 1 » coupe une ligne (`scinder_ligne_restaurant`).
  Prix = prix actuel de l'article (comme en caisse). La table se libère quand tout est encaissé ou annulé.
- **Annulation d'une addition** : `annuler_vente` accepte désormais les ventes `restaurant` (même règle que la caisse :
  caisse encore ouverte, motif). Les plats restent rattachés à la vente annulée (historique).
- **Notifications** : envoi → les personnes qui ont `restaurant_cuisine.preparer` ; prêt → le serveur de la table.

## Droits
`restaurant_salle.lire / servir / encaisser / annuler / gerer`, `restaurant_cuisine.lire / preparer`.
Gérant, responsable : tout. Responsable Hub : tout sauf gérer. Caissier (employé) : lire, servir, encaisser, voir la cuisine.
Nouveaux rôles : **Serveur** (salle + caisse.utiliser + paiements.encaisser, pas d'annulation) et **Cuisinier** (cuisine).
Comptable, lecteur : lecture. Lecture limitée aux Hubs autorisés du membre (RLS `lecture_hub`).

## Fonctions
`enregistrer_table_restaurant`, `definir_poste_preparation`, `ouvrir_commande_restaurant`, `ajouter_lignes_restaurant`,
`modifier_ligne_restaurant`, `envoyer_commande_restaurant`, `avancer_ligne_restaurant`, `annuler_ligne_restaurant`,
`transferer_commande_restaurant`, `scinder_ligne_restaurant`, `encaisser_commande_restaurant`,
`annuler_commande_restaurant`, `clore_commande_restaurant`, `tableau_de_bord_restaurant`.
Interne : `commande_restaurant_ouverte`, trigger `proteger_ligne_restaurant` (un plat envoyé ne change plus).

## Écrans
- **Salle** (`#/salle`) : indicateurs du jour, plan par zone (libre / occupée / plat prêt, montant, minutes), à emporter.
- **Commande** (`#/salle/<id>`) : carte par catégorie, plats et statuts, Envoyer, Servir, note, annulation (motif),
  changer de table, Addition (séparée) → paiement (même fenêtre que la caisse) → reçu.
- **Tables et postes** (`#/salle/reglages`) : tables par zone et Hub, poste de chaque article.
- **Écran cuisine** (`#/cuisine`) : bons par commande (Cuisine, Bar, Tout), couleur selon l'attente (10 / 20 min),
  Commencer / Prêt, liste des plats prêts ; rafraîchi toutes les 15 secondes.
- Widget « Restaurant » sur le tableau de bord.

## Démo
Établissement « Restaurant Démo » (client Commerce Démo) : 6 tables, carte congolaise fictive, une table encaissée
(addition séparée), une table en cours, une terrasse au bar, une commande à emporter. Comptes fictifs
`resto@`, `serveur@`, `cuisine@demo.agence-elite.fr` (sans mot de passe utilisable) ; Patrondemo y est gérant.

## Limites connues (évolutions futures)
- Pas de fiches techniques (recettes) : les ingrédients ne sont pas déduits du stock ; seuls les articles suivis
  en stock (boissons) le sont.
- Pas d'options / suppléments payants par plat (la note est libre) ni de menus composés.
- Pas de réservations de table ni d'impression automatique des bons (l'écran cuisine les remplace).
- Pas de plan de salle dessiné (grille par zone).

## Import de carte

Articles → Importer accepte un CSV avec catégorie, nom, description, prix, variante neutre, état, ordre et poste de préparation. Un dry-run obligatoire annonce créations, modifications, lignes inchangées et lignes en attente avant toute écriture. Les références rendent l'opération idempotente ; les articles sans prix sont signalés mais ne deviennent jamais vendables. L'import ne crée ni recette, ni mouvement, ni stock initial.
## Réservations de tables

La Salle affiche les prochaines réservations. Une réservation contient client, téléphone, horaire, durée, couverts, Hub,
table facultative et note. La base refuse une capacité excessive et deux réservations qui se chevauchent sur la même table.
À l'arrivée, le serveur marque le client arrivé puis ouvre normalement la table : commandes, stock, ventes et paiements
restent les briques communes.

## Service réel : serveurs, catégories, disponibilité (2026-10-05, migration `20261005000001`)

Générique (aucun client nommé dans le code) ; préparé pour l'onboarding de The Dream.

- **Serveur affecté à une table** (`rest_affectations`) : établissement, Hub, table, serveur, début, fin, auteur, motif
  de début et de fin. Une seule affectation en cours par table ; changer de serveur termine l'affectation précédente
  (historique conservé) ; retirer une table ou la déplacer de Hub termine son affectation.
  Fonctions `affecter_serveur_table`, `retirer_serveur_table`, liste `serveurs_restaurant`.
- **Serveur de la commande** : à l'ouverture sur table, la commande prend le serveur affecté (sinon celui qui l'ouvre) ;
  `pris_par` garde l'auteur réel. À emporter : pas de fausse table, serveur = celui qui la prend. Changer le serveur
  d'une table ne change **pas** les commandes déjà ouvertes : `transferer_serveur_commande` (droit dédié, motif,
  `rest_transferts_serveur`, notification) est l'action volontaire prévue.
- **Statistiques** `statistiques_serveurs_restaurant(etab, du, au)` : tables affectées, tables servies, commandes
  (en cours, clôturées, annulées), couverts, additions, chiffre, encaissé, addition moyenne, plats annulés après envoi.
  Le chiffre vient des ventes réelles liées aux plats (une vente annulée ne compte pas).
- **Tableau de la salle** : en plus des clés existantes, `postes` (cuisine / bar en préparation), `serveurs_actifs`,
  `tables_affectees`, `encaisse_jour`, `ticket_moyen`.
- **Disponibilité** : `definir_disponibilite_article` (gérant, responsable de salle ou cuisine) ; un article
  indisponible ou épuisé est refusé par `ajouter_lignes_restaurant` et grisé à l'écran. Le libellé du plat porte la
  variante (« Château Rodet — Tarif 2 ») sur le bon et l'addition.
- **Catégories d'articles** : description, ordre, masquage, archivage avec destination des articles, restauration,
  déplacement en masse (`enregistrer_categorie_article`, `ordonner_categories_articles`, `archiver_categorie_article`,
  `restaurer_categorie_article`, `deplacer_articles_categorie`). Une catégorie masquée disparaît des puces de la caisse
  et de la prise de commande ; ses articles restent vendables dans « Tout ».
- **Import** : `importer_catalogue` dédoublonne (référence, sinon désignation + variante + catégorie, sans accents ni
  casse, article sans référence), garde le suivi de stock d'un article existant, signale les doublons du fichier et les
  changements de prix, nomme l'établissement de destination, journalise l'import.

Écrans : Salle (filtres Toutes / Mes tables / Libres / Occupées / Réservées / par serveur, nom du serveur sur chaque
table, bouton « Affecter les serveurs », encart « Service en cours » pour les responsables), `#/salle/serveurs`
(activité par période, historique des affectations et des transferts), commande (serveur affiché, « Transférer à un
autre serveur », recherche sans accents, quantités en cours sur les tuiles, barre de commande fixe sur téléphone),
Articles (onglet Catégories, filtre par catégorie, sélection multiple, disponibilité, rapport d'import détaillé).

Droits ajoutés : `articles.categories`, `restaurant_salle.affecter`, `restaurant_salle.transferer`,
`restaurant_salle.performances` (gérant, responsable, responsable Hub). Les serveurs voient toutes les tables de leurs
Hubs (pour ne pas placer deux clients à la même table) et filtrent « Mes tables » ; ils ne voient que leurs propres
chiffres.

Limites restantes : pas d'options ni de suppléments structurés (les 2 ou 3 accompagnements d'une planche restent dans
sa description et la note du plat) ; pas de recette ni de déduction de matières ; pas de plan de salle dessiné.
