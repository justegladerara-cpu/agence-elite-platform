# Matrice de tests de l'interface (Elite UX 2.0)

Tout se passe sur la **démo locale** (`npm run build:demo`, base PGlite dans le navigateur, données fictives).
Jamais sur la base de production, jamais avec un vrai compte.

## Outils
| Outil | Ce qu'il vérifie | Commande |
|---|---|---|
| Tests unitaires (Vitest + PGlite) | règles, écrans, composants ; `tests/elite_ux.test.jsx` : montants longs, `ChiffreCle`, champs (aide, erreur annoncée), onglets au clavier, favoris, historique, barre du téléphone (seulement les écrans autorisés), CSS des modules sans sélecteur nu ; `tests/impression.test.js` : règles d'impression | `npm test` |
| Parcours navigateur (Chromium) | 94 étapes : caisse, reçu imprimé, ticket Z, tous les modules, thème sombre, téléphone, tablette | `npm run test:e2e` |
| Parcours des clients en service | vente, reçu imprimé, Ventes › reçu, ticket Z imprimé, facture A4 imprimée, Salle, Réception et Chambres de l'hôtel, à 1366 et 390 px | `node scripts/ux_parcours_clients.cjs` |
| Captures et lisibilité | 21 écrans × 6 largeurs : débordement de page, montants sur deux lignes, masqués ou hors écran, cibles < 36 px | `DOSSIER=… node scripts/ux_captures.cjs` |
| Mesures de vitesse (laboratoire) | téléphone 390 px, processeur ×4 ; connexion, caisse, encaissement, tableau de bord, rendus React | `node scripts/ux_mesures.cjs`, `node scripts/ux_mesures_connexion.cjs` |

Les scripts navigateur prennent `CHROMIUM_PATH` (Chromium déjà installé) et `URL_APP` (par défaut `http://localhost:4173/`).

## Matrice
| Contrôle | 320 | 375 / 390 | 430 | 768 | 1024 | 1366 | 1440 / 1920 | Outil |
|---|---|---|---|---|---|---|---|---|
| Aucune page plus large que l'écran | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | captures |
| Montant jamais sur deux lignes ni « … » | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | captures + tests |
| Montant visible sans glisser (listes en fiches) | ✓ | ✓ | — | tableau | tableau | tableau | tableau | captures |
| Barre du haut : rien hors de l'écran, établissement visible | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | captures |
| Barre d'onglets du téléphone | ✓ | ✓ | ✓ | ✓ | — | — | — | captures + tests |
| Caisse : Encaisser toujours visible | ✓ | ✓ | ✓ | ✓ (debout et couchée) | ✓ | ✓ | ✓ | e2e (tablette) |
| Caisse : cibles ≥ 48 px (recherche, catégories), panier ≥ 44 px | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | captures |
| Reçu, ticket Z, facture A4 imprimés | — | ✓ | — | — | — | ✓ | — | parcours clients + e2e |
| Hôtel (Réception, Chambres), Salle | — | ✓ | — | — | — | ✓ | — | parcours clients + e2e |
| Thème sombre | — | ✓ | — | — | — | ✓ | — | e2e |

Autres conditions :
- **Clavier seul** : focus visible partout (`:focus-visible`), onglets (flèches, Début, Fin), graphiques (flèches),
  lignes de liste (Entrée, Espace), Ctrl+K, N, Alt+1…9, Échap ferme les fenêtres. Tests unitaires + e2e (palette).
- **Zoom 125 / 150 / 200 %** et **grand texte** : préférence « Taille du texte » (`data-texte`) et zoom du navigateur ;
  à 200 % un écran de 1366 px se comporte comme 683 px (barre d'onglets, fiches) : couvert par les largeurs 640–768.
- **Mouvement réduit** : réglage de l'appareil respecté (`src/motion/preferences.js`), rien ne bouge en « Réduites ».
- **Portrait / paysage** : tablette 768×1024 et 1024×700 dans l'e2e (bouton Encaisser visible).
- **Hors ligne** : caisse hors ligne (e2e `caisse-hors-ligne`), PWA inchangée.
- **Elite Simple, white-label** : tests existants (`mode_simple`, `marque`) ; aucune couleur de marque en dur ajoutée.

## Ce qui n'est pas automatisé
- Lecteurs d'écran réels (NVDA, TalkBack, VoiceOver) : vérifiés par la structure (rôles, libellés, `aria-live`), pas
  avec un vrai lecteur.
- Téléphones réels : les mesures sont faites en laboratoire (Chromium, processeur ralenti), pas sur un appareil.
