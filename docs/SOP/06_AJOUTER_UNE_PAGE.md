# SOP 06 · Ajouter une page (et son entrée de menu)

1. Créer `src/modules/<module>/<Page>.jsx` à partir de [`templates/TEMPLATE_PAGE.jsx`](templates/TEMPLATE_PAGE.jsx).
2. La page commence par `PageHeader` (fil d'Ariane, titre, actions) ; le fil s'affiche dans la barre du haut.
3. Données : `useDonnees(() => api.rpc(...), [dépendances])`. États : `Squelette`, `EmptyState`, `Erreur`.
4. Déclarer la page dans le **manifeste** du module (`src/modules/<module>/manifeste.js`, tableau `pages`) :
   `id`, `libelle`, `icone`, `groupe`, `ordre`, `permission`, et si besoin `horsMenuSi` / `pleinEcran`.
   Le menu est **dynamique** : la page n'apparaît que si le module est activé et la permission accordée.
   Un nouveau `groupe` s'ajoute automatiquement à la fin du menu (ou l'ajouter à `GROUPES` pour le placer).
5. Espace Agence Elite : route dans `src/modules/editeur/EspaceEditeur.jsx` (`MENU_EDITEUR`).
6. Vérifier sur mobile (390 px) : rien ne déborde, les tableaux défilent dans leur cadre.
7. Le titre de l'onglet du navigateur suit `libelle` et le nom de logiciel affiché (SOP 39).
