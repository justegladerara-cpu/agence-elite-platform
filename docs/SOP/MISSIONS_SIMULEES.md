# Missions simulées

Trois exemples déroulés avec les SOP, pour vérifier qu'elles suffisent à faire le travail.

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
