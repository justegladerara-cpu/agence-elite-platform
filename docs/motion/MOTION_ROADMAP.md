# Suite possible (Elite Motion System)

Classement : valeur pour l'utilisateur / coût / risque pour les performances.

| # | Amélioration | Valeur | Coût | Risque perf | Note |
|---|---|---|---|---|---|
| 1 | Charger à la demande l'espace éditeur et les pages publiques (`App.jsx` les importe tous) | Haute (ouverture plus rapide, surtout téléphone) | Faible | Aucun (gain) | Le fichier d'entrée pèse ~178 Ko gzip ; ce n'est pas de l'animation, d'où son report. |
| 2 | Animations de **sortie** (fenêtres, menus, notifications retirées à la main) avec un composant de « présence » (garder 150 ms, inerte, `aria-hidden`) | Moyenne | Moyen | Faible | Reporté : les parents ferment les fenêtres en les retirant ; une sortie demande de toucher ce modèle et peut gêner les parcours automatisés (double fenêtre pendant 150 ms). |
| 3 | Mettre en pause les relectures quand l'onglet est caché (cloche 60 s, caisse 30 s, cuisine 15 s) | Moyenne (batterie, données mobiles) | Faible | Aucun (gain) | Touche la fraîcheur des données métier : à valider avec Juste. |
| 4 | Compteur animé sur `StatCard` et les chiffres de l'accueil | Moyenne | Faible | Faible | Demande une valeur numérique à côté du texte formaté. |
| 5 | Indicateur glissant sous l'onglet actif (onglets, périodes du tableau de bord) | Faible à moyenne | Faible | Faible | Mesure des positions au changement seulement. |
| 6 | View Transitions API pour les changements d'écran (navigateurs compatibles, repli actuel ailleurs) | Moyenne | Moyen | Faible | À tester sur téléphones d'entrée de gamme. |
| 7 | Squelettes à la forme exacte de chaque écran | Moyenne | Moyen | Aucun | Réduit l'impression d'attente. |
| 8 | Démo : la carte de connexion grandit quand la liste des profils arrive (CLS mesuré 0,31) | Faible (démo seulement) | Faible | Aucun | L'écran de connexion réel n'a pas cette liste. |
