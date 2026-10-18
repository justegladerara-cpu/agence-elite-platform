# Audit du mouvement et des performances d'interface (SaaS, avant EMS)

Fait le 2026-10-18 sur `main` `74bfdef`, en lisant le code (pas seulement `package.json`). Numéros de ligne = `main`
avant la PR.

## Ce qui existait
| Sujet | Constat |
|---|---|
| Routage | Hash (`src/noyau/routes.js`), une page par module ; `GardeErreur key={établissement-page-requête}` remonte l'écran à chaque changement (`src/App.jsx:651`). |
| Découpage du code | Bon : chaque écran de module en `lazy()` (`src/modules/*/manifeste.js`), `jsqr` et les sources de données (`supabase.js`, base locale) chargés à la demande. |
| Fichier d'entrée | **611,7 Ko (177,8 Ko gzip)** : `App.jsx:19-27` importe d'office l'espace éditeur et toutes les pages publiques (boutique, site, menu QR, espace client, partenaires). |
| CSS | Une feuille de 3 236 lignes (`src/styles.css`, 18,1 Ko gzip), variables de couleur, marque blanche par `src/noyau/marque.js`. |
| Transitions | Quelques-unes, durées en dur (0,08 s à 0,2 s) : champs (`styles.css:94`), boutons (`:154`), tuiles de caisse (`:1130`), menu (`:2113`), indicateurs (`:2252`, `:2916`), tiroirs mobiles (`:1612`, `:1688`). |
| Images clés | `tourner` (rouet, en boucle, `:327`), `apparaitre` (notification `:359`, voile `:934`), `squelette` (en boucle, `:2388`). |
| `will-change` | Aucun (bien). |
| IntersectionObserver | Aucun ; un ResizeObserver (aperçu des pages de connexion), nettoyé. |
| Minuteries | Toutes nettoyées au démontage : cloche 60 s (`src/ui/communs.jsx:337`), caisse 30 s + au retour sur la fenêtre (`src/modules/caisse/Caisse.jsx:683-684`) et 60 s (`:729`), commandes QR, cuisine 15 s, verrou de caisse, version (avec `visibilitychange`). |
| Graphiques | SVG maison (`GraphiqueBarres`), aucune bibliothèque. |
| Caisse | Appui de tuile 80 ms, tiroir panier mobile 200 ms ; rien ne bloque la saisie. |

## Défauts relevés
| # | Défaut | Où | Gravité | Suite |
|---|---|---|---|---|
| 1 | **Le focus quitte le champ en cours de saisie d’une fenêtre** (il repart sur le premier élément focalisable, en pratique le bouton « Fermer ») à chaque nouvel affichage du parent : l'effet de `Modale` dépend de `onFermer`, souvent une fonction recréée (124 lignes `<Modale … onFermer={() => …}>` dans `src/`). Ex. fermeture de caisse ouverte pendant le comptage : la caisse se relit toutes les 30 s et au retour sur la fenêtre. | `src/ui/composants.jsx:153`, `Caisse.jsx:1061` | Haute (saisie perturbée) | Corrigé, testé (unitaire + navigateur) |
| 2 | Le voile glisse de 8 px avec la fenêtre (animation `apparaitre` sur le fond). | `styles.css:934` | Faible | Corrigé |
| 3 | Squelettes en couleurs claires fixes, éblouissants en thème sombre. | `styles.css:2386` | Faible | Corrigé |
| 4 | Pas de focus clavier visible sur `.bouton`, `.icone-bouton`, liens, onglets. | `styles.css:141` et suiv. | Moyenne (accessibilité) | Corrigé |
| 5 | Pile de notifications illimitée, disparition sèche. | `src/noyau/espace.jsx:51`, `styles.css:343` | Faible | Corrigé (3 visibles, fondu de sortie) |
| 6 | « Réduire les animations » couvrait seulement squelette et survol des indicateurs ; aucun réglage dans l'application. | `styles.css:2391` | Moyenne | Corrigé |
| 7 | Boucles (rouet, squelette) actives dans un onglet caché. | `styles.css:327`, `:2388` | Faible | Corrigé (pause) |
| 8 | Fichier d'entrée lourd (pages publiques et éditeur importés d'office). | `src/App.jsx:19-27` | Moyenne (ouverture) | Non traité (hors animation) : ROADMAP #1 |
| 9 | Relectures (cloche, caisse, cuisine) même onglet caché. | `communs.jsx:337`, `Caisse.jsx:683`, `Cuisine.jsx:28` | Faible | Non traité (données métier) : ROADMAP #3 |
| 10 | Démo : la carte de connexion grandit à l'arrivée des profils (CLS 0,31 mesuré). | `src/App.jsx:86-131` | Faible (démo) | ROADMAP #8 |
| 11 | Démo : la base tourne dans le navigateur ; ses requêtes occupent le fil principal (secondes de longues tâches au démarrage et à l'ouverture de la caisse). | `src/noyau/donnees/local.js` | Sans objet en production | Pris en compte dans la lecture des mesures |
