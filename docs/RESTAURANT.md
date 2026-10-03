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
