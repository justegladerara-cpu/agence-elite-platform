# Missions simulées

Cinq exemples déroulés avec les SOP, pour vérifier qu'elles suffisent à faire le travail.

## 1. « Le client ouvre un deuxième magasin »
1. [SOP 26](26_CREER_UN_HUB.md) : Hubs → Nouveau Hub « Magasin Marché », type point de vente.
2. Nouvelle caisse sur ce Hub.
3. [SOP 20](20_CREER_GERER_UTILISATEURS.md) : compte par identifiant `Awa.marche`, rôle Caissier, case du nouveau Hub.
4. [SOP 27](27_TRANSFERT_DE_STOCK.md) : transfert du Magasin principal vers le Magasin Marché pour le stock de départ.
5. Le sélecteur de Hub apparaît ; le tableau de bord montre « Par Hub ».
**Vérifié :** Awa ne voit que les ventes et le stock de son Hub (testé dans `tests/hubs.test.js`).

## 2. « Un caissier a oublié son mot de passe »
1. [SOP 21](21_REINITIALISER_UN_MOT_DE_PASSE.md) : Comptes → la personne → nouveau mot de passe temporaire.
2. Le caissier se connecte avec son identifiant, crée son mot de passe.
**Vérifié :** l'ancien mot de passe et le temporaire ne fonctionnent plus (CI, `scripts/verifier_comptes.mjs`).

## 3. « Ajouter un module Fidélité »
1. [SOP 02](02_CREER_UN_MODULE.md) : migration avec module `fidelite` en `en_preparation`, tables avec RLS, RPC.
2. [SOP 04](04_AJOUTER_UNE_PERMISSION.md) : `fidelite.gerer` pour Responsable d'établissement.
3. [SOP 06](06_AJOUTER_UNE_PAGE.md) : page déclarée avec `module: 'fidelite'`.
4. [SOP 08](08_ECRIRE_DES_TESTS.md) / [09](09_TESTS_OFFENSIFS.md) : refus sans module accordé.
5. [SOP 12](12_DEPLOYER_EN_PRODUCTION.md) puis Agence Elite → Modules → statut actif, et [SOP 24](24_ACCORDER_UN_MODULE.md) pour un client pilote.

## 4. « Ajoute le module Fournisseurs » (test d'extensibilité)
1. **Chercher avant de créer.** Catalogue : le module `achats` (« Achats et fournisseurs ») existe en **Prévu**,
   avec ses dépendances (`articles`, `stock`, `contacts`). Les fournisseurs eux-mêmes existent déjà :
   `contacts.type` vaut `client`, `fournisseur` ou `les_deux`. **On ne crée ni module `fournisseurs` ni table
   `fournisseurs`** : ce serait une donnée dupliquée.
2. Besoin réel = « commander et réceptionner auprès d'un fournisseur ». [SOP 02](02_CREER_UN_MODULE.md) :
   migration qui passe `achats` en `en_preparation`, tables `commandes_achat` / `lignes_commande_achat`
   (`etablissement_id`, `hub_id`, `contact_id` d'un contact fournisseur), RLS, RPC `enregistrer_commande_achat`
   et `receptionner_commande` qui écrit des **mouvements de stock** (jamais un stock à part).
3. [SOP 04](04_AJOUTER_UNE_PERMISSION.md) : `achats.lire`, `achats.gerer` ; rôles Responsable, Gestionnaire dépôt.
4. [SOP 40](40_DECLARER_DES_CAPACITES_HUB.md) : capacité `stock` (on réceptionne dans un Hub qui gère du stock).
5. Manifeste `src/modules/achats/manifeste.js` : page « Achats » (groupe Catalogue et stock),
   widget « Commandes en attente » ([SOP 37](37_AJOUTER_UN_WIDGET.md)).
6. Tests : isolation, refus sans module, réception = mouvement de stock tracé, aucune suppression.
7. [SOP 42](42_CYCLE_DE_VIE_D_UN_MODULE.md) : Bêta chez un pilote, puis Disponible ; [SOP 38](38_CREER_UNE_OFFRE.md) pour l'inclure dans une offre.
**Vérifié dans le code actuel :** le catalogue refuse de rendre `achats` « Disponible » tant qu'il n'a pas de
permission (`tests/personnalisation_catalogue.test.js`), et aucune offre ne peut l'inclure avant.

## 5. « Ajoute la Solution Gestion scolaire » (test d'extensibilité)
1. [SOP 33](33_CREER_UNE_SOLUTION.md) : Catalogue → Solutions → Nouvelle solution `scolaire`, statut Prévue.
   Le socle (établissement, équipe, tableau de bord) est ajouté seul. **Aucun code, aucune app séparée.**
2. Réutiliser : `contacts` (parents), `paiements` et `recus` (frais de scolarité), `depenses`, `membres` (personnel).
3. Modules propres à programmer ([SOP 02](02_CREER_UN_MODULE.md)) : catégorie « Éducation »
   ([SOP 41](41_GERER_LES_CATEGORIES.md)), modules `scolaire_eleves`, `scolaire_classes`, `scolaire_notes`
   en Prévu d'abord. Une **classe n'est pas un Hub** : c'est une donnée du module, rattachée à un Hub (le site de l'école).
4. Dépendances ([SOP 34](34_DECLARER_DES_DEPENDANCES.md)) : `scolaire_notes` → `scolaire_eleves` → `contacts`.
5. Offre ([SOP 38](38_CREER_UNE_OFFRE.md)) seulement quand un module métier est Bêta ; la base refuse « En service » avant.
6. Identité ([SOP 39](39_PERSONNALISER_UN_CLIENT.md)) : l'école peut afficher son propre nom et sa couleur.
**Vérifié dans le code actuel :** `enregistrer_solution` crée `scolaire` avec le socle et refuse de la passer
« En service » sans module disponible (`tests/personnalisation_catalogue.test.js`).
