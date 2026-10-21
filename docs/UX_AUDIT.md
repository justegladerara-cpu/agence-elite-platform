# Audit UX de l'interface — Elite UX 2.0 (2026-10-21)

Audit fait **avant** la refonte, sur la **démo locale** (`npm run build:demo`, base PGlite dans le navigateur, données
fictives), jamais sur la production ni avec un vrai compte. Outil : `scripts/audit_ux.cjs` (reproductible), complété par
l'audit The Dream du 2026-10-21 (captures et constats sur une copie fictive, dossier projet `audit-the-dream-2026-10-21`).

- **Couverture** : 12 profils de démo connectables (3 autres demandent un changement de mot de passe), 53 pages
  différentes, 615 écrans (téléphone 390 px, tablette 820 px, ordinateur 1366 px).
- **Montants longs** : 0, 500, 25 000, 1 250 000, 125 750 000 et 3 456 789 012 FCFA injectés dans toutes les cartes
  de chiffres du tableau de bord, à 320, 375, 390, 430, 768, 1024, 1366, 1440 et 1920 px.
- Résultat après refonte : [ELITE_UX_2.md](ELITE_UX_2.md). Matrice de tests : [UX_TEST_MATRIX.md](UX_TEST_MATRIX.md).

## Chiffres de départ (avant)
| Mesure (615 écrans) | Avant |
|---|---|
| Écrans qui élargissent la page (défilement horizontal) | 21 |
| Montants coupés par « … » | 0 |
| Cartes de montant long qui sortent de leur carte (54 essais × 38 cartes) | 72 |
| Essais de montant long où la page déborde | 24 sur 54 (toutes les largeurs ≤ 430 px) |
| Cibles cliquables < 40 px (téléphone) | 2 225 sur 3 172 |
| Cibles < 24 px (toutes tailles) | 628 |
| Textes sous le contraste AA | 8 603 |
| Erreurs dans la console | 0 |

## Constats par gravité

### Bloquant (P1)
| # | Constat | Où | Cause |
|---|---|---|---|
| UX-01 | Le tableau de bord élargit l'écran du téléphone : actions, onglets et période sortent à droite (= TD-010 The Dream) | Tableau de bord, Fidélité, Comptabilité, Support, Salle, Clôtures (téléphone) | `.page` en grille sans `minmax(0, 1fr)` : un bloc large élargit toute la page |
| UX-02 | Avec un montant de 7 chiffres et plus, des cartes de chiffres sortent de leur cadre sur téléphone | Tableau de bord ≤ 430 px | taille de chiffre fixe (22 px) dans une carte de 150 px |
| UX-03 | Textes secondaires illisibles en plein soleil : `--texte-faible` à 3,0:1, titres du menu à 4,0:1, vert des succès à 3,4:1 | partout (8 603 textes) | couleurs des jetons sous le seuil AA de 4,5:1 |

### Important (P2)
| # | Constat | Où |
|---|---|---|
| UX-04 | Tableaux Caissières et Serveurs de 623 px : la colonne Montant sort de l'écran (TD-020) | Tableau de bord, téléphone |
| UX-05 | Vue d'ensemble : le CA apparaît deux fois (bandeau + carte domaine) et la carte domaine n'occupe qu'un quart de la largeur (TD-013) | Tableau de bord |
| UX-06 | Barre du haut sur téléphone : la recherche est écrasée, le sélecteur de Hub chevauche la cloche | toutes les pages ≤ 430 px |
| UX-07 | Caisse : boutons + et − de 34 px, retrait d'article de 28 px (cible caisse attendue : 48 px) | Caisse |
| UX-08 | Tuiles « 0 en stock » grisées alors qu'elles restent vendables, prix peu contrasté, « -17 en stock » affiché (TD-023) | Caisse |
| UX-09 | Graphiques : valeur seulement dans une infobulle (souris) ; rien au toucher ni au clavier ; textes des axes à 7 px sur téléphone | Tableaux de bord |
| UX-10 | « Total dû : 52000 », « Écart cumulé : -317500 » : nombres non groupés (TD-002, affichage) | À surveiller |
| UX-11 | « À surveiller » : jusqu'à 26 lignes d'affilée sur téléphone | Tableau de bord |
| UX-12 | Indicateurs : pas de période sur la carte ; valeur absente affichée « — » sans explication ; évolution donnée par la couleur seule dans la carte bleue | Tableaux de bord |
| UX-13 | Outils d'administration (« Doublon de… », « Désactiver ») au milieu des chiffres Serveurs | Tableau de bord |
| UX-14 | « Transfert » proposé avec un seul Hub ; « Voir les retours » avec une flèche vers la gauche (TD-024) | Tableau de bord |
| UX-15 | Niveaux d'une application (« Dans l'offre », « Activé »…) distingués par la couleur seule | Paramètres › Applications |
| UX-16 | Thème sombre : survol des boutons et lignes en clair (variable de survol absente du thème) | partout en sombre |
| UX-17 | Pages publiques (boutique, menu QR, site…) chargées avec l'application : script d'ouverture de 636 Ko | ouverture |

### Gênant (P3)
| # | Constat | Où |
|---|---|---|
| UX-18 | Textes de 10,5 à 11,5 px (compteurs de la cloche, palette Ctrl+K, pastilles « Nouveau », touches) | partout |
| UX-19 | Vignettes d'articles « B( » (ponctuation prise comme initiale) | Caisse, Articles |
| UX-20 | Champ obligatoire non signalé dans le libellé ; erreurs générales en haut du formulaire, pas sous le champ | formulaires |
| UX-21 | 40 tableaux métier simples gardent un défilement horizontal sur téléphone (lisibles mais moins confortables que des fiches) | Ventes, Stock, Clôtures, Factures… |
| UX-22 | Écran cuisine : un bon élargit la page sur téléphone, tablette et ordinateur (toujours présent après la refonte) | Écran cuisine |

### Non vérifié (dit comme tel)
- Lecteurs d'écran réels (NVDA, TalkBack) : seules les règles (rôles, libellés, `aria-*`) sont vérifiées par tests.
- Vrais appareils et imprimantes thermiques : impression vérifiée par le parcours navigateur (aperçu Chromium).
- Données réelles de The Dream / Hôtel 2i : non utilisées (dépôt public) ; les constats The Dream viennent de la copie fictive.

## Points forts à garder
Palette Ctrl+K, menu court + « Plus d'outils » + récents, Elite Simple, préférences d'affichage par appareil (thème,
texte, contraste, gros boutons), états vides et squelettes présents, caisse hors ligne, barre « Encaisser » toujours
visible sur téléphone, aucune erreur console sur 615 écrans.
