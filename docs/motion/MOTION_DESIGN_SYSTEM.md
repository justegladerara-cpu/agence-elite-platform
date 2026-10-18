# Jetons d'animation (Elite Motion System)

Source : `src/motion/motion.css` (variables CSS sur `:root`). Ne jamais écrire une durée ou une courbe en dur dans un
composant : utiliser ces variables.

## Durées
| Jeton | Équilibrées (défaut) | Complètes | Légères | Réduites | Usage |
|---|---|---|---|---|---|
| `--ems-duree-instant` | 80 ms | 80 ms | 80 ms | ≈ 0 | appui (bouton, tuile de caisse) |
| `--ems-duree-rapide` | 140 ms | 160 ms | 100 ms | ≈ 0 | survol, focus, onglets, menus déroulants, voile |
| `--ems-duree-moyenne` | 200 ms | 240 ms | 140 ms | ≈ 0 | page, fenêtre, notification, carte |
| `--ems-duree-lente` | 320 ms | 420 ms | 200 ms | ≈ 0 | indicateurs, barres de graphique, tiroir mobile |

« ≈ 0 » : en « Réduites », toute animation et transition dure 0,01 ms (état final immédiat, événements conservés).

## Courbes
| Jeton | Valeur | Usage |
|---|---|---|
| `--ems-courbe-standard` | `cubic-bezier(0.2, 0, 0, 1)` | couleurs, fondus |
| `--ems-courbe-sortie` | `cubic-bezier(0.16, 1, 0.3, 1)` | entrées (rapide puis doux) |
| `--ems-courbe-ressort` | `cubic-bezier(0.34, 1.4, 0.64, 1)` | petits éléments qui « posent » (compteur de tuile, icône d'état vide) ; = sortie en « Légères » |

## Distances et échelles
| Jeton | Défaut | Complètes | Légères / Réduites |
|---|---|---|---|
| `--ems-distance` (entrée verticale) | 6 px | 10 px | 0 |
| `--ems-distance-toast` | 12 px | 18 px | 0 |
| `--ems-echelle-modale` | 0,98 | 0,96 | 1 |
| `--ems-echelle-menu` | 0,97 | 0,97 | 1 |
| `--ems-appui` (bouton) / `--ems-appui-tuile` (caisse) | 0,98 / 0,97 | idem | 1 |
| `--ems-leve` (survol d'un indicateur) | −1 px | −1 px | 0 |
| `--ems-decalage` (cascade, 6 éléments au plus) | 30 ms | 40 ms | 0 |
| `--ems-decalage-barre` (barres de graphique, 12 au plus) | 18 ms | 24 ms | 0 |

## Animations (images clés)
`ems-fondu`, `ems-entree` (fondu + montée), `ems-modale`, `ems-menu`, `ems-toast-entree`, `ems-toast-sortie`,
`ems-pop`, `ems-barre`, `ems-jauge`, `ems-surlignage` (ligne de tableau), `ems-surlignage-panier` (caisse).
Toutes en remplissage `backwards` : aucun effet ne reste après la fin.

## Niveaux
| Niveau | Effet |
|---|---|
| `complet` | un peu plus ample et plus long |
| `equilibre` | défaut |
| `leger` | fondus courts seulement, aucun déplacement, aucun compteur |
| `reduit` | aucun mouvement : tout est immédiat (rouet et squelettes figés) |
