# SOP 34 · Déclarer les dépendances d'un module

- Table `module_dependances(module_id, depend_de)` : « `caisse` dépend de `ventes` ».
- Par migration uniquement (les dépendances sont du code : elles disent ce que le module appelle).
- La base refuse :
  - une **boucle** (A dépend de B qui dépend de A) : déclencheur `verifier_dependance_module` ;
  - une offre ou un module accordé **sans ses dépendances** : `verifier_modules_offre` ;
  - le retrait d'un module dont un autre module accordé dépend.
- Un module **Prévu** n'est jamais accepté dans une offre, une licence ou une activation.
- Test : ajouter dans `tests/` un cas qui vérifie le refus d'une offre incomplète.
