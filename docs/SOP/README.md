# SOP : procédures de la plateforme Agence Elite

Ces procédures disent **comment faire** chaque type de travail, pour un humain ou une IA
(Claude, GPT, Codex…). Elles complètent `docs/DECISIONS.md` (pourquoi) et
`docs/ARCHITECTURE.md` (comment c'est construit).

**Règle d'or :** avant toute tâche, trouvez la ligne qui correspond dans la matrice
ci-dessous, lisez la SOP indiquée, puis appliquez la [Definition of Done](31_DEFINITION_OF_DONE.md).
Une IA lit aussi les [règles pour les IA](32_REGLES_POUR_LES_IA.md).

## Matrice d'orientation : « je veux… »

| Je veux… | SOP | Qui |
|---|---|---|
| Ajouter une fonctionnalité à un module existant | [01](01_AJOUTER_UNE_FONCTIONNALITE.md) | Dev |
| Créer un nouveau module (ex. « Fidélité ») | [02](02_CREER_UN_MODULE.md) | Dev |
| Changer le schéma de la base | [03](03_CREER_UNE_MIGRATION.md) | Dev |
| Ajouter un droit (permission) | [04](04_AJOUTER_UNE_PERMISSION.md) | Dev |
| Écrire une opération serveur (RPC) | [05](05_ECRIRE_UNE_FONCTION_RPC.md) | Dev |
| Ajouter un écran | [06](06_AJOUTER_UNE_PAGE.md) | Dev |
| Construire une interface cohérente | [07](07_UTILISER_LE_DESIGN_SYSTEM.md) | Dev |
| Écrire des tests | [08](08_ECRIRE_DES_TESTS.md) | Dev |
| Tester la sécurité (attaques) | [09](09_TESTS_OFFENSIFS.md) | Dev |
| Corriger un bug | [10](10_CORRIGER_UN_BUG.md) | Dev |
| Relire du code | [11](11_REVUE_DE_CODE.md) | Dev |
| Mettre en production | [12](12_DEPLOYER_EN_PRODUCTION.md) | Agence Elite |
| Sauvegarder ou restaurer la base | [13](13_SAUVEGARDER_ET_RESTAURER.md) | Agence Elite |
| Vérifier la production après un déploiement | [14](14_SMOKE_TESTS_PRODUCTION.md) | Agence Elite |
| Réagir à un incident | [15](15_INCIDENT_PRODUCTION.md) | Agence Elite |
| Revenir en arrière | [16](16_RETOUR_ARRIERE.md) | Agence Elite |
| Gérer un secret | [17](17_GERER_LES_SECRETS.md) | Agence Elite |
| Créer un client | [18](18_CREER_UN_CLIENT.md) | Agence Elite |
| Créer un établissement | [19](19_CREER_UN_ETABLISSEMENT.md) | Agence Elite |
| Créer ou gérer des utilisateurs | [20](20_CREER_GERER_UTILISATEURS.md) | Agence Elite, responsable |
| Réinitialiser un mot de passe | [21](21_REINITIALISER_UN_MOT_DE_PASSE.md) | Agence Elite |
| Vendre / attribuer une licence | [22](22_ATTRIBUER_UNE_LICENCE.md) | Agence Elite |
| Suspendre ou réactiver | [23](23_SUSPENDRE_REACTIVER.md) | Agence Elite |
| Accorder un module en plus | [24](24_ACCORDER_UN_MODULE.md) | Agence Elite |
| Aider un client à distance | [25](25_SESSION_SUPPORT.md) | Agence Elite |
| Ouvrir une boutique ou un dépôt (Hub) | [26](26_CREER_UN_HUB.md) | Responsable, Agence Elite |
| Déplacer du stock entre Hubs | [27](27_TRANSFERT_DE_STOCK.md) | Responsable, gestionnaire dépôt |
| Faire un inventaire | [28](28_INVENTAIRE.md) | Responsable, gestionnaire dépôt |
| Clôturer une caisse (ticket Z) | [29](29_CLOTURE_DE_CAISSE.md) | Caissier, responsable |
| Faire une démonstration commerciale | [30](30_DEMO_COMMERCIALE.md) | Agence Elite |
| Savoir si une tâche est finie | [31](31_DEFINITION_OF_DONE.md) | Tous |
| Faire travailler une IA sur le projet | [32](32_REGLES_POUR_LES_IA.md) | Tous |
| Créer une Solution, y ajouter des modules | [33](33_CREER_UNE_SOLUTION.md) | Agence Elite, Dev |
| Déclarer les dépendances d'un module | [34](34_DECLARER_DES_DEPENDANCES.md) | Dev |
| Ajouter un réglage à un module | [35](35_AJOUTER_UN_PARAMETRE.md) | Dev |
| Ajouter une entrée de menu | [36](36_AJOUTER_UNE_ENTREE_DE_MENU.md) | Dev |
| Ajouter un indicateur / tableau de bord | [37](37_AJOUTER_UN_WIDGET.md) | Dev |
| Créer une offre pour une Solution | [38](38_CREER_UNE_OFFRE.md) | Agence Elite |
| Personnaliser le logiciel d'un client (white-label) | [39](39_PERSONNALISER_UN_CLIENT.md) | Agence Elite |
| Déclarer les capacités Hub d'un module | [40](40_DECLARER_DES_CAPACITES_HUB.md) | Dev |
| Gérer les catégories du catalogue | [41](41_GERER_LES_CATEGORIES.md) | Agence Elite |
| Développer, tester, déployer un module (statuts) | [42](42_CYCLE_DE_VIE_D_UN_MODULE.md) | Dev, Agence Elite |
| Joindre des fichiers, bibliothèque Documents | [43](43_PIECES_JOINTES_ET_DOCUMENTS.md) | Dev |
| Envoyer une notification (cloche) | [44](44_ENVOYER_UNE_NOTIFICATION.md) | Dev |
| Devis, facture, paiement, avoir, trop-perçu, contestation, relevé client | [45](45_FACTURER_UN_CLIENT.md) | Client, Agence Elite |
| Demande d’achat, commande fournisseur, réception, paiement | [46](46_ACHETER_A_UN_FOURNISSEUR.md) | Client, Agence Elite |
| Prospect, opportunité, relance, devis lié, gagné / perdu, qualification, audit, doublons | [47](47_SUIVRE_UN_PROSPECT.md) | Client, Agence Elite |
| Projet, tâches, temps passé, facturation du temps | [48](48_PILOTER_UN_PROJET.md) | Client, Agence Elite |
| Restaurant : tables, commandes, cuisine, addition séparée | [49](49_SERVIR_EN_SALLE.md) | Client |
| Hôtel : chambres, réservations, arrivées, départs facturés, entretien | [50](50_GERER_UN_HOTEL.md) | Client |
| E-commerce : boutique en ligne, commandes, livraison, retours | [51](51_VENDRE_EN_LIGNE.md) | Client |
| Site web : pages par blocs, publication, messages | [52](52_CREER_UN_SITE_WEB.md) | Client et Agence Elite |
| Agenda : rendez-vous, planning, facturation | [53](53_PRENDRE_UN_RENDEZ_VOUS.md) | Client |
| Support : tickets clients, échanges, résolution | [54](54_TRAITER_UN_TICKET.md) | Client |
| Abonnements : formules, abonnés, factures périodiques | [55](55_GERER_LES_ABONNEMENTS.md) | Client |
| Rapports : ventes par période, article, vendeur, Hub, export | [56](56_LIRE_LES_RAPPORTS.md) | Client |
| Fidélité : points sur achats, récompenses, ajustements | [57](57_FIDELISER_LES_CLIENTS.md) | Client |
| Personnaliser les pages de connexion (textes, logo, apparence, publication) | [58](58_PERSONNALISER_LES_PAGES_DE_CONNEXION.md) | Agence Elite |
| Importer le catalogue réel d'un client (vérification, dry-run, import, contrôle) | [59](59_IMPORTER_LE_CATALOGUE_D_UN_CLIENT.md) | Agence Elite + client |
| Connecter un service externe (mode test, clé chiffrée, webhook, désactivation) | [60](60_CONNECTER_UN_SERVICE_EXTERNE.md) | Gérant |
| Utiliser l'assistant (alertes du jour, réglage des seuils) | [61](61_UTILISER_L_ASSISTANT.md) | Gérant + Agence Elite |
| Fabriquer un produit (recette, ordre, fin de fabrication) | [62](62_FABRIQUER_UN_PRODUIT.md) | Gérant + atelier |
| Louer un objet (parc, réservation, remise, retour, caution) | [63](63_LOUER_UN_OBJET.md) | Équipe + gérant |
| Livrer un client (livraison, tournée, preuve, échec) | [64](64_LIVRER_UN_CLIENT.md) | Responsable + livreur |
| Gérer les inscriptions et les frais d'une école (Scolarité) | [65](65_GERER_UNE_ECOLE.md) | Responsable + secrétariat |
| Tenir la comptabilité (plan, écritures générées, balance, grand livre) | [66](66_TENIR_LA_COMPTABILITE.md) | Gérant + comptable |
| Mener une campagne (accords, segments, préparation, envoi déclaré) | [67](67_MENER_UNE_CAMPAGNE.md) | Gérant + commercial |
| Gérer un contrat (depuis un devis, avenants, préavis, registre des engagements) | [68](68_GERER_UN_CONTRAT.md) | Gérant + commercial |
| Données personnelles d’un contact (export, anonymisation) et partage de documents par lien | [69](69_DONNEES_PERSONNELLES_ET_PARTAGE.md) | Gérant + équipe |
| Pilotage : rentabilité client et par canal, prévision pondérée, charge par personne, engagements à risque | [70](70_PILOTER_L_ACTIVITE.md) | Gérant, responsable |
| Photographier et recadrer un document, envoi qui reprend après une coupure de réseau | [72](72_PHOTOGRAPHIER_UN_DOCUMENT.md) | Toute l'équipe |
| Espace client : ouvrir un lien, répondre aux messages, traiter les dépôts, révoquer, rendez-vous en ligne, aide publiée | [71](71_OUVRIR_UN_ESPACE_CLIENT.md) | Gérant, responsable, commercial |

Modèles prêts à copier : [`templates/`](templates/). Exemples de missions déroulées :
[MISSIONS_SIMULEES.md](MISSIONS_SIMULEES.md).

## Principes non négociables (rappel)

1. **La base est la frontière de sécurité.** L'écran cache, la base refuse.
2. **Écriture par fonctions RPC, lecture par RLS.** Aucune écriture directe dans une table métier.
3. **Rien ne se supprime** dans les données financières et de stock : on annule avec un motif.
4. **Le schéma évolue par nouvelles migrations**, jamais en modifiant une migration appliquée.
5. **Aucun secret** dans le code, les commits, les journaux ou la documentation.
6. **Aucune donnée réelle** dans les tests, la démo ou les captures.
7. **Simplicité pour le petit commerce** : un seul Hub = aucune notion de Hub à l'écran.
