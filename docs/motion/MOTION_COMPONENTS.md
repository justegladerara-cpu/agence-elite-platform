# Composants animés (Elite Motion System)

| Élément | Avant | Après | Fichier |
|---|---|---|---|
| Boutons (`.bouton`, `.icone-bouton`, liens) | fond et bordure 150 ms | + appui (échelle 0,98, 80 ms), ombre d'accent au survol du bouton principal, **anneau de focus clavier** visible | `motion.css` |
| `Bouton chargement` | texte « Patientez… », désactivé | + `aria-busy`, petit rouet devant le texte ; état lié à la vraie requête, double envoi toujours impossible | `composants.jsx`, `motion.css` |
| Champs | cadre et anneau de focus 150 ms | durées des jetons (aucun « tremblement » d'erreur : le message suffit) | `motion.css` |
| Onglets, périodes, puces | changement sec | fondu de couleur 140 ms | `motion.css` |
| Menu latéral | fond 120 ms | fond et indicateur actif 200 ms, icône qui glisse de 2 px au survol ; « Plus d'outils » : groupes dépliés en fondu montant (cascade courte), icône qui pivote ; tiroir mobile 320 ms courbe douce, voile en fondu | `motion.css` |
| Pages et modules | apparition sèche | fondu 200 ms à chaque changement d'écran (opacité seulement : aucun saut de mise en page, aucun effet sur les barres fixes) | `motion.css` |
| Cartes (`.carte`) | — | fondu à l'arrivée (après le squelette) | `motion.css` |
| Indicateurs (`Kpi`, `StatCard`, `.indicateur`, Hubs) | — | entrée montante en cascade (6 au plus, 30 ms d'écart) ; survol : levée de 1 px | `motion.css` |
| Chiffre d'un indicateur du tableau de bord | remplacé d'un coup | **glisse vers la nouvelle valeur quand elle change** (changement de période, de Hub…), 380 ms, fin exacte ; jamais au premier affichage | `cockpit.jsx` → `NombreAnime` |
| `Modale`, palette Ctrl+K | voile et fenêtre glissaient ensemble de 8 px | voile en fondu seul ; fenêtre : fondu + 6 px + échelle 0,98, 200 ms ; Échap et piège du focus inchangés | `motion.css` |
| `Modale` (correctif) | un nouvel affichage du parent relançait l'effet : **le focus revenait au premier champ** pendant la saisie (ex. fermeture de caisse, rafraîchie toutes les 30 s) | effet lancé une seule fois, `onFermer` lu dans une référence | `composants.jsx` |
| Menus « ••• », profil, cloche | apparition sèche | fondu + échelle depuis le coin, 140 ms | `motion.css` |
| Notifications | entrée 200 ms, pile illimitée, disparition sèche | entrée latérale, **fondu de sortie** juste avant le retrait, **3 visibles au plus** | `motion.css` |
| Squelettes | couleurs claires fixes (trop vives en thème sombre) | couleurs du thème ; reflet en pause quand l'onglet est caché | `motion.css` |
| États vides | — | entrée douce, icône qui se pose | `motion.css` |
| Erreurs, bandeaux d'état, bulles d'aide | — | entrée douce (attire l'œil sans bouger la page) | `motion.css` |
| `DataTable` | — | **ligne ajoutée** après le premier affichage : fond d'accent qui s'efface en 1,6 s ; rien au premier chargement, au tri, à la pagination, ni pour plus de 5 lignes d'un coup ; aucune animation de déplacement ni de retrait | `composants.jsx` → `useLignesNouvelles` |
| `GraphiqueBarres` (SVG) | — | barres qui montent depuis la base, en cascade (12 au plus) | `composants.jsx` (`--i`), `motion.css` |
| Répartitions et jauges | — | remplissage depuis la gauche | `motion.css` |
| **Caisse** : tuile d'article | appui 0,97 en 80 ms | inchangé (jetons) | `motion.css` |
| **Caisse** : ligne du panier | — | la ligne ajoutée s'éclaire 700 ms (couleur seulement) | `motion.css` |
| **Caisse** : compteur de la tuile | — | se pose (160 ms) au premier ajout | `motion.css` |
| **Caisse** : total, monnaie, reste dû, Encaisser, Valider | — | **jamais animés** | — |

Non animés exprès : retraits de lignes, fermetures de fenêtres (voir MOTION_ROADMAP.md), impression, reçus.
