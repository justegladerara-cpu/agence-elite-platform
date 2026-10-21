# Matrice de tests UX — Elite UX 2.0 (2026-10-21)

Tout se passe sur la **démo locale** (`npm run build:demo`, PGlite, données fictives). Aucun vrai compte, aucune
donnée réelle, aucune écriture en production. Résultats : [ELITE_UX_2.md](ELITE_UX_2.md).

## Outils
| Outil | Commande | Ce qu'il vérifie |
|---|---|---|
| Vitest + PGlite | `npm test` | règles métier (inchangées), composants, permissions, hors ligne, impression |
| Composants Elite UX | `npx vitest run tests/elite_ux.test.jsx` | `Champ` (aide/erreur reliées), `Kpi` (6 montants de 0 à 3 456 789 012 FCFA, valeur absente ≠ 0, évolution en mots), `GraphiqueBarres` (clavier, toucher), `grouperNombres`, périodes, « Transfert » avec un seul Hub |
| Parcours Chromium | `npm run test:e2e` (après `npx vite preview --port 4173`) | 94 parcours : connexion, caisse, vente, reçu imprimé, ticket Z, Ventes › reçu, factures imprimées, hôtel, restaurant, téléphone, thème sombre, hors ligne |
| Audit des écrans | `CHROMIUM_PATH=… node scripts/audit_ux.cjs sortie.json` | 12 profils × toutes leurs pages × 3 formats : débordement, cibles < 40 px et < 24 px, contraste AA, textes < 12 px, montants coupés ; montants longs à 9 largeurs |
| Captures | `PROFIL=Mireille node scripts/captures_ux.cjs dossier prefixe` | accueil, tableau de bord et caisse aux 9 largeurs ; 12 autres écrans en 390 et 1366 ; thème sombre et texte très grand |
| Vitesse | `RALENTIS=4 RESEAU=lent node scripts/mesure_motion.cjs sortie.json` | connexion, tableau de bord, changement d'écran, fenêtre, caisse (ouverture, ajout, encaisser), tailles des fichiers |

## Largeurs et modes
| Cas | Audit | Captures | Parcours | Résultat |
|---|---|---|---|---|
| 320, 375, 390, 430 px (téléphones) | montants longs | oui | téléphone 390 | OK |
| 768, 1024 px (tablettes) | montants longs ; écrans à 820 | oui | tablette (restaurant) | OK |
| 1366, 1440, 1920 px | montants longs ; écrans à 1366 | oui | ordinateur | OK |
| Portrait / paysage | — | 390×844 portrait, 1024×1024 | téléphone portrait | paysage téléphone **non testé** |
| Zoom 125 / 150 / 200 % | — | texte « très grand » (×1,25) | — | 150 et 200 % **non testés** à l'outil ; la page en `minmax(0,1fr)` et les cartes en requête de conteneur suivent la largeur |
| Grand texte | — | « très grand » | — | OK |
| Clavier seul | — | — | tests composants (graphique, champs) | focus visible partout (`:focus-visible`) ; parcours complet au clavier **non automatisé** |
| Thème sombre | — | oui | `theme-sombre` | OK |
| Mouvement réduit | — | — | `motion.test.jsx` | OK (`prefers-reduced-motion` respecté, tuiles de caisse comprises) |

## Parcours The Dream / Hôtel 2i (sur la démo, données fictives)
| Parcours | Vérifié par | Résultat |
|---|---|---|
| Connexion | parcours `connexion` | OK |
| Caisse : vente, encaissement, reçu imprimé | parcours caisse + `mobile-caisse` | OK |
| Ticket Z | parcours fermeture de caisse / `fermeture-caisse-reglage` | OK |
| Ventes › reçu | parcours `ventes-jour-passe` | OK |
| Factures imprimées (A4) | parcours factures | OK |
| Écrans hôtel | parcours hôtel | OK |
| Caisse hors ligne | `caisse_hors_ligne*.test` | OK |
| Elite Simple, white-label, préférences d'affichage | `confort.test.jsx`, `noyau.test.jsx`, `registre.test.jsx` | OK |
