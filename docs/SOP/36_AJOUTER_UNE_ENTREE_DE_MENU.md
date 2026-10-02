# SOP 36 · Ajouter une entrée de navigation

Le menu est construit à partir des manifestes (`src/modules/index.js` → `pagesDuMenu`, `groupesDuMenu`).
- Une page déclarée dans un manifeste apparaît seule quand : module **activé** + **permission** accordée
  (+ `horsMenuSi` faux).
- Groupes existants : Pilotage, Vente, Catalogue et stock, Relations, Organisation. Un nouveau groupe
  (ex. « Hôtel », « Ressources humaines ») est ajouté au manifeste ; le placer dans `GROUPES` pour fixer son rang.
- `ordre` règle la position dans le groupe.
- Ne jamais afficher une entrée pour un module **Prévu** : il n'a pas de manifeste.
- La page d'accueil choisie par l'utilisateur (Mon profil → Préférences) doit être une page accessible :
  sinon la première page accessible est utilisée.
