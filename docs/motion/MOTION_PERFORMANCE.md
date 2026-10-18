# Performances avant / après (Elite Motion System)

## Méthode
- Script : `scripts/mesure_motion.cjs` (reproductible). Démo locale (`npm run build:demo` + `npx vite preview`),
  Chromium headless installé (`chromium-1194`, piloté par Playwright 1.63) **sans carte graphique** (rendu logiciel), conteneur 4 processeurs, 1366×820.
- Deux conditions : processeur normal (1×) et ralenti 4× (`Emulation.setCPUThrottlingRate`, CDP). 3 passages chacune,
  **médiane** donnée. Avant chaque action : 1,5 s sans longue tâche.
- Mesures : FCP, LCP, CLS (`PerformanceObserver`), « TBT » = somme des longues tâches au-delà de 50 ms, latence d'une
  action jusqu'à l'écran peint (2 images), images de plus de 25 ms dans les 400 ms suivantes, pire interaction
  (Event Timing), animations encore actives au repos.
- Avant : `main` `74bfdef`. Après : branche EMS (avant fusion de `main` #65, qui ne touche que le menu).
- Non mesurable ici : `saas.agence-elite.fr` (injoignable depuis le conteneur), vrais téléphones, GPU.

## À lire avant les chiffres
La démo fait tourner **la base de données dans le navigateur** (PGlite) : au démarrage et à l'ouverture de la caisse,
ses requêtes occupent le fil principal pendant des secondes. Ces lignes (connexion, tableau de bord, ouverture de la
caisse) varient de **±30 à 45 %** d'une série à l'autre, y compris la phase de démarrage de la base qui a lieu avant
tout affichage animé (168 s → 215 s à 4×) : ce sont du bruit, pas un effet de l'EMS. En production (Supabase), ce
travail n'existe pas. Les lignes utiles sont les interactions (fenêtre, ajout au panier, encaissement), confirmées
par une comparaison **dans la même session** (A/B ci-dessous), sans ce bruit.

## Taille (version de production, `npm run build`, gzip niveau 9)
| | Avant | Après | Écart |
|---|---|---|---|
| JS d'entrée | 182,3 Ko | 183,3 Ko | +1,0 Ko |
| CSS d'entrée | 18,6 Ko | 20,2 Ko | +1,6 Ko |
| JS total (tous les écrans) | 588,1 Ko | 589,7 Ko | +1,6 Ko |
| Dépendances | — | — | 0 ajoutée |

## Série complète (médianes, démo)
| Mesure | 1× avant | 1× après | 4× avant | 4× après |
|---|---|---|---|---|
| FCP connexion | 468 ms | 508 ms | 792 ms | 808 ms |
| CLS connexion (démo) | 0,306 | 0,306 | 0,306 | 0,306 |
| CLS ouverture caisse | 0,148 | 0,148 | 0,148 | 0,148 |
| Animations actives au repos | 0 | 0 | 0 | 0 |
| Changement de module (menu) | 446 ms | 454 ms | 707 ms | 864 ms* |
| Ouverture d'une fenêtre (Nouvel article) | 135 ms | 183 ms | 338 ms | 375 ms |
| Fermeture d'une fenêtre (Échap) | 36 ms | 49 ms | 87 ms | 109 ms |
| Ajout d'un article au panier | 64 ms | 90 ms | 221 ms | 240 ms |
| Ouverture de l'encaissement | 143 ms | 214 ms | 311 ms | 590 ms |
| Pire interaction (Event Timing) | 64 ms | 56 ms | 176 ms | 232 ms |
| Connexion → tableau de bord | 28,4 s | 32,5 s | 173 s | 230 s* |
| Ouverture de la caisse | 14,7 s | 15,7 s | 73 s | 106 s* |

\* dominé par la base de démo (longues tâches de 66 à 213 s) : voir « À lire avant les chiffres ».

## A/B dans la même session (après connexion, même page, 1×, 8 mesures, médiane)
On bascule `data-animations` entre « équilibré » et « réduit » sans recharger : seul l'EMS change.
| Action | Équilibré | Réduit (aucune animation) | Images > 25 ms (équ. / réd.) |
|---|---|---|---|
| Fenêtre « Nouvel article » | 113 ms | 89 ms | 3 / 0 |
| Ajout au panier | 86 ms | 79 ms | 0 / 0 |
| Encaissement — **première version** | 145 ms | 95 ms | 3 / 0 |
| Encaissement — **version livrée** | 96 ms | 96 ms | 0 / 0 |

## Ce qui a été retiré ou simplifié après mesure
- **Fenêtre d'encaissement** : l'entrée animée (et le fondu du voile, qui existait déjà avant l'EMS) retardait son
  affichage complet de ~50 ms. Elle s'affiche maintenant d'un coup (`.voile:has(.bouton-valider-vente)`), plus vite
  qu'avant l'EMS.
- Gardé en connaissance de cause : l'entrée des autres fenêtres coûte ~20 ms et quelques images lentes **en rendu
  logiciel** ; sur un appareil avec carte graphique, opacité et transformation sont composées sans recalcul. Le niveau
  « Légères » (fondu seul) ou « Réduites » les supprime pour un appareil faible.
- Ajout au panier : écart de 7 ms en A/B (dans le bruit) ; la ligne s'éclaire par la couleur seulement.

## Refaire la mesure
```bash
npm run build:demo && npx vite preview --port 4173 &
CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) node scripts/mesure_motion.cjs resultat.json
# options : RALENTIS=1,4  REPETITIONS=3  URL_APP=…
```
