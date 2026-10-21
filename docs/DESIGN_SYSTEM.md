# Elite Design System

Référence unique pour l'interface (humains et IA). Code : jetons et styles dans `src/styles.css` (bloc `:root` en tête,
un seul), composants dans `src/ui/`. Procédure : [SOP 07](SOP/07_UTILISER_LE_DESIGN_SYSTEM.md).
Refonte Elite UX 2.0 (2026-10-21) : [ELITE_UX_2.md](ELITE_UX_2.md), audit : [UX_AUDIT.md](UX_AUDIT.md).

## Principes
1. **Simple pour le petit commerce** : un seul Hub = aucune notion de Hub à l'écran ; vocabulaire métier
   (Caissier, Responsable d'établissement, Hub, Ticket Z), jamais technique.
2. **Une action principale par écran** (bouton bleu) ; le reste dans le menu •••.
3. **Toujours un état** : chargement (`Squelette`), vide (`EmptyState` qui dit quoi faire), erreur (`Erreur` en français simple).
4. **Rien d'irréversible sans `Confirmation`** ; rien d'irréversible du tout sur les données financières.
5. **Mobile d'abord pour la caisse** : utilisable dès 320 px, cibles tactiles ≥ 40 px (≥ 48 px en caisse).
6. **Un chiffre se lit en entier** : un montant n'est jamais coupé par « … » ni abrégé sans sa valeur complète.
7. **Jamais l'information par la couleur seule** : un mot, une icône ou une flèche l'accompagne.

## Jetons (variables CSS, `:root` de `src/styles.css`)
Les noms existants sont gardés : la couleur de marque (white-label) et les thèmes en dépendent.

### Couleurs
| Rôle | Variable | Clair | Contraste |
|---|---|---|---|
| Fond de page | `--fond` | `#f4f6f9` | — |
| Carte, panneau | `--surface` / `--surface-douce` / `--surface-survol` | `#ffffff` / `#f8fafc` / `#f2f5fa` | — |
| Bordure | `--bordure` / `--bordure-forte` | `#e3e8ef` / `#cbd3df` | — |
| Texte | `--texte` | `#18202f` | 15,9:1 |
| Texte secondaire | `--texte-doux` | `#5b6577` | 5,4:1 sur le fond |
| Texte discret | `--texte-faible` | `#646d80` | 4,8:1 sur le fond (avant : 3,0:1) |
| Action, lien | `--accent` / `--accent-fort` / `--accent-doux` | `#2563eb` / `#1d4ed8` / `#e8f0fe` | blanc sur accent 5,2:1 |
| Succès | `--vert` / `--vert-doux` | `#047857` / `#e3f6ee` | 4,9:1 (avant : `#0e9f6e`, 3,4:1) |
| Attention | `--orange` / `--orange-doux` | `#c2410c` / `#fff1e6` | 4,7:1 |
| Alerte | `--rouge` / `--rouge-doux` | `#c81e1e` / `#fdecec` | 5,0:1 |
| Barre latérale | `--menu`, `--menu-texte`, `--menu-titre`, `--menu-survol`, `--menu-actif` | `#0f172a`, `#c3ccdb`, `#8b98b1`, `#1b2538`, `#1f2b42` | titres 6,1:1 |
| Voile des fenêtres | `--voile` | `rgba(15,23,42,.45)` | — |

Thème sombre : mêmes variables redéfinies sous `:root[data-theme='sombre']` (et `auto` + système sombre),
`--surface-survol` comprise. Contraste élevé : `:root[data-contraste='eleve']`.

**Couleur de marque (white-label)** : `--accent`, `--accent-fort`, `--accent-doux`, `--bleu-doux` sont redéfinies à l'exécution
par `appliquerMarque` (`src/noyau/marque.js`) à partir de la **palette contrôlée** (`COULEURS_MARQUE`). Ne jamais écrire
`#2563eb` en dur : toujours `var(--accent…)`. Les couleurs d'état ne changent jamais avec la marque.

### Typographie
Police Inter (repli système). Tailles : `--texte-xs` 12 · `--texte-s` 13 · `--texte-m` 14 (corps) · `--texte-l` 16 ·
`--texte-xl` 20 · `--texte-2xl` 24 · `--texte-chiffre` 24. **Rien sous 12 px à l'écran** (tickets imprimés exceptés).
Chiffres : `font-variant-numeric: tabular-nums` (classe `.chiffre`), alignés à droite dans les tableaux (`.nombre`).

### Espacements, rayons, ombres, cibles, coquille
- Espacements multiples de 4 : `--esp-1` 4 · `--esp-2` 8 · `--esp-3` 12 · `--esp-4` 16 · `--esp-5` 20 · `--esp-6` 24 · `--esp-8` 32.
- Rayons : `--rayon-petit` 8 · `--rayon` 10 · `--rayon-grand` 14 (cartes) · `--rayon-pilule` 999.
- Élévations : `--ombre` (bouton, petite carte) · `--ombre-carte` (1, carte) · `--ombre-flottante` (2, menu) · `--ombre-forte` (3, fenêtre).
- Cibles : `--cible` 40 px partout · `--cible-caisse` 48 px (caisse, « Gros boutons »).
- Coquille : `--barre-haut` 60 · `--largeur-menu` 252 · `--largeur-page` 1320 ; couches `--z-barre` 20 · `--z-tiroir` 40 ·
  `--z-modale` 50 · `--z-notification` 60.
- États : focus clavier visible partout (`:focus-visible`, contour 2 px accent) ; désactivé = opacité + curseur interdit ;
  erreur = `aria-invalid` (bordure rouge) + message sous le champ.

### Points de rupture et grilles
| Largeur | Comportement |
|---|---|
| ≤ 420 px | grilles de chiffres sur une colonne |
| ≤ 560 px | barre du haut sur deux lignes : choix Établissement / Hub en pleine largeur sous les boutons |
| ≤ 600–640 px | listes (`DataTable`, `.tableau.empilable`) en fiches ; carte « En caisse maintenant » sur deux lignes |
| ≤ 860 px | menu en tiroir, caisse sur une colonne avec barre « Encaisser » fixe, indicateurs sur 2 colonnes |
| ≤ 1100 px | panier de caisse 330 px |
| > 1100 px | page centrée, largeur max `--largeur-page` |
La page est une grille `minmax(0, 1fr)` : aucun bloc ne peut élargir l'écran (TD-010).

## Coquille
- **Barre latérale** groupée : Pilotage · Vente · Catalogue et stock · Relations · Organisation, menu court + « Plus d'outils ».
  Seule source : registre des modules (module actif + permission). Elite Simple filtre ce menu, rien d'autre.
- **Barre du haut** : fil d'Ariane (publié par `PageHeader`), recherche Ctrl+K, « + » Créer (touche N), sélecteur
  d'établissement (si plusieurs), de Hub (si plusieurs Hubs actifs), cloche, profil.
- Téléphone (< 860 px) : menu en tiroir ; sous 560 px, les sélecteurs passent sur une deuxième ligne.

## Inventaire des composants
| Composant | Fichier | Usage | À ne pas faire |
|---|---|---|---|
| `Icone` | composants.jsx | pictogramme 24×24, `aria-hidden` | icône seule sans libellé ni `aria-label` |
| `Bouton` | composants.jsx | variantes `principal`, `secondaire`, `danger`, `discret` ; `chargement` | deux boutons principaux |
| `Champ` | composants.jsx | libellé + contrôle + `aide` + `erreur` (reliés par `aria-describedby`) ; astérisque automatique si `required` | message d'erreur loin du champ |
| `Recherche` | composants.jsx | champ de recherche d'une liste | — |
| `Badge`, `StatusBadge` | composants.jsx | état court (texte + couleur) | couleur sans texte |
| `Vide`, `EmptyState` | composants.jsx | état vide qui dit quoi faire | « Aucune donnée » seul |
| `Chargement`, `Squelette` | composants.jsx | attente (rôle `status`) | écran blanc |
| `Erreur` | composants.jsx | erreur en français simple (rôle `alert`) | message technique |
| `Modale`, `ModaleMotif`, `Confirmation` | composants.jsx | saisie courte, motif obligatoire, action sensible (piège du focus, Échap) | `window.confirm` ; modale pendant un encaissement |
| `PageHeader`, `EnTete`, `FilAriane` | composants.jsx | titre, sous-titre, badges, actions, fil | titre technique |
| `Tabs`, `Onglets` | composants.jsx | sous-parties d'une fiche (défilent sur téléphone) | plus de 8 onglets |
| `Section` | composants.jsx | bloc titré | sections imbriquées |
| `StatCard`, `Indicateur` | composants.jsx | chiffre clé (dans `.grille-stats`) | plus de 6 par ligne |
| `Kpi`, `GrilleKpis` | tableau_de_bord/cockpit.jsx | indicateur : titre, valeur complète, domaine · période, évolution (flèche + mots), détail ; « Donnée indisponible » ≠ 0 | abréger un montant ; `text-overflow: ellipsis` |
| `DataTable` | composants.jsx | liste : recherche, filtres, tri, pagination, export CSV, impression ; fiches sur téléphone | tableau sans état vide |
| `.tableau.empilable` | styles.css | tableau simple (cellules `data-label`) qui devient fiches sous 640 px | cacher une colonne |
| `MenuActions` | composants.jsx | actions secondaires ••• | y mettre l'action principale |
| `GraphiqueBarres` | composants.jsx | barres, axe gradué, largeur réelle du cadre ; valeur exacte au survol, au clavier (Tab) et au toucher (1er appui = valeur, 2e = détail) | deux échelles ; info seulement en infobulle |
| `Avatar` | composants.jsx | initiales ou photo | — |
| `Palette` | Palette.jsx | Ctrl+K : pages, fiches, actions de création | — |
| `Cloche`, `PiecesJointes`, `ModalePartage`, `BandeauBrouillon` | communs.jsx | notifications, pièces, partage, brouillon retrouvé | — |
| `BandeauConnexion`, `AnnonceMiseAJour` | Etat.jsx | hors ligne / nouvelle version | bloquer la caisse |
| `Marque`, `ChoixCouleur`, `ApercuMarque`, `ChampsApparence` | Marque.jsx | white-label | couleur libre hors palette |
| `PastilleNouveau`, `BandeauNouveau` | Nouveau.jsx | nouveauté datée | — |
| `Recadrage` | Recadrage.jsx | recadrer une image | — |
| `NombreAnime` | motion/NombreAnime.jsx | compteur animé (tableaux de bord) | dans la caisse |

## Montants
- Toujours `formatMontant` / `useEspace().montant` : groupes de 3 chiffres séparés par des espaces simples, devise à la fin.
- Dans un indicateur, la taille suit la largeur de la carte (requête de conteneur `cqi`) ; le texte passe à la ligne
  **entre** les groupes, jamais au milieu. Vérifié de 0 à 3 456 789 012 FCFA, de 320 à 1920 px (`scripts/audit_ux.cjs`).
- Un nombre de 5 chiffres ou plus écrit dans un texte venu de la base est groupé à l'affichage (`grouperNombres`).

## Libellés imposés
- Montants contractuels (licences) : « Activité contractuelle », jamais « encaissé ».
- Rôles : Responsable d'établissement, Responsable, Responsable Hub, Gestionnaire dépôt, Caissier, Comptable, Lecteur ;
  plateforme : Super Admin, Admin, Support.
- Hub : « Point de vente », « Dépôt », « Mixte ».

## Règle CSS des modules
Le CSS d'un module est **global** dès qu'il est chargé : jamais de sélecteur nu `body`, `html` ou `*` dans un fichier de module ;
toute règle `@media print` passe sous `body.<classe>`. Les règles communes vont dans `src/styles.css`, pas en double.

## Animations (Elite Motion System)
Jetons de durée, de courbe et de distance, niveaux (Complètes / Équilibrées / Légères / Réduites), composants animés,
mouvement réduit, mesures et retour arrière : [`docs/motion/`](motion/MOTION_STRATEGY.md) (code : `src/motion/`).
Règles courtes : seulement `opacity` et `transform` ; durées par les variables `--ems-*` ; jamais de compteur au
premier affichage ni dans la caisse ; rien qui retarde une saisie ou un paiement ; `prefers-reduced-motion` respecté.
