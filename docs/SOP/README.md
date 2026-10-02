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
