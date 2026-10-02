# SOP 01 · Ajouter une fonctionnalité à un module existant

**Quand :** un module existe (`src/modules/<module>`) et on lui ajoute un comportement.

1. Lire `docs/DECISIONS.md` et la fiche du module dans `src/modules/index.js`.
2. Écrire en une phrase ce que l'utilisateur voit avant / après.
3. Si la donnée change : nouvelle migration ([SOP 03](03_CREER_UNE_MIGRATION.md)).
4. Si une écriture est nécessaire : fonction RPC ([SOP 05](05_ECRIRE_UNE_FONCTION_RPC.md)),
   jamais d'`insert`/`update` direct depuis le navigateur.
5. Si un nouveau droit est nécessaire : [SOP 04](04_AJOUTER_UNE_PERMISSION.md).
6. Interface : composants de `src/ui/composants.jsx` ([SOP 07](07_UTILISER_LE_DESIGN_SYSTEM.md)).
7. Tests : un test de la règle côté base + un test d'écran si l'écran change ([SOP 08](08_ECRIRE_DES_TESTS.md)).
8. `npm test` puis `npm run build` : tout vert.
9. Vérifier la [Definition of Done](31_DEFINITION_OF_DONE.md).

**Pièges :** oublier le filtre Hub (`hub_id`) sur une liste de ventes, de dépenses ou de stock ;
afficher une notion de Hub alors que l'établissement n'en a qu'un (`multiHub` est faux).
