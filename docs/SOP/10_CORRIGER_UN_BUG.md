# SOP 10 · Corriger un bug

1. Reproduire : écrire le test qui échoue **avant** de corriger.
2. Trouver la cause (base, RPC, écran ?). Ne pas masquer le symptôme côté écran si la base est fausse.
3. Correction minimale. Si le schéma ou une fonction en production est en cause : **nouvelle migration**
   (`create or replace function`), jamais en éditant l'ancienne.
4. `npm test` + `npm run build`.
5. Données déjà abîmées en production : script de correction séparé, revu, avec sauvegarde avant
   ([SOP 13](13_SAUVEGARDER_ET_RESTAURER.md)). Jamais de suppression de données financières.
6. Noter la décision dans `docs/DECISIONS.md` si la règle métier a changé.
