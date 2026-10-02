# SOP 06 · Ajouter une page

1. Créer `src/modules/<module>/<Page>.jsx` à partir de [`templates/TEMPLATE_PAGE.jsx`](templates/TEMPLATE_PAGE.jsx).
2. La page commence par `PageHeader` (fil d'Ariane, titre, actions) ; le fil s'affiche dans la barre du haut.
3. Données : `useDonnees(() => api.rpc(...) ou api.from(...).select(...), [dépendances])`.
   État de chargement `Squelette`, état vide `EmptyState`, erreur `Erreur`.
4. Déclarer la page dans `src/modules/index.js` (`id`, `titre`, `icone`, `groupe`, `module`, `permission`,
   `horsMenuSi` si elle n'a de sens qu'en multi-Hub).
5. Espace Agence Elite : ajouter la route dans `src/modules/editeur/EspaceEditeur.jsx` (`MENU_EDITEUR`).
   Les adresses sont des chemins `#/editeur/clients/<id>` (voir `src/noyau/routes.js`).
6. Vérifier sur mobile (largeur 390 px) : rien ne déborde, les tableaux défilent dans leur cadre.
