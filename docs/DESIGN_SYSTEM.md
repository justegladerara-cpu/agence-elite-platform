# Elite Design System

Référence unique pour l'interface de la plateforme (humains et IA). Code : jetons et styles communs dans
`src/styles.css`, composants dans `src/ui/composants.jsx` et `src/ui/Navigation.jsx`, animations dans `src/motion/`.
Procédure : [SOP 07](SOP/07_UTILISER_LE_DESIGN_SYSTEM.md). Historique de la refonte : [ELITE_UX_2](ELITE_UX_2.md).

## Principes
1. **Simple pour le petit commerce** : un seul Hub = aucune notion de Hub à l'écran ; vocabulaire métier
   (Caissier, Responsable d'établissement, Hub, Ticket Z), jamais technique.
2. **Une action principale par écran** (bouton plein, couleur de marque) ; le reste en boutons secondaires ou dans •••.
   En caisse, l'action principale est « Encaisser » ; « Fermeture de caisse » est secondaire.
3. **Toujours un état** : chargement (`Squelette`, `Chargement`), vide (`EmptyState` qui dit quoi faire),
   erreur (`Erreur` en français simple). Un chiffre qui n'a pas pu être calculé s'affiche « Indisponible », jamais « 0 ».
4. **Rien d'irréversible sans `Confirmation`** ; rien d'irréversible du tout sur les données financières.
5. **Au doigt d'abord** : cibles ≥ 40 px partout (`--cible`), ≥ 48 px en caisse (`--cible-tactile`), utilisable à 320 px.
6. **Un montant ne se coupe jamais** : ni en deux lignes (« 125 750 » / « 000 FCFA »), ni par « … ». Voir `ChiffreCle`.
7. **Jamais d'information par la couleur seule** : une couleur d'état est toujours accompagnée d'un mot ou d'une flèche.

## Jetons (`:root` de `src/styles.css`)
Les noms existants ne changent jamais : la couleur de marque, les thèmes, le contraste élevé et les modules en dépendent.

### Couleurs
| Rôle | Variable | Clair | Contraste (AA) |
|---|---|---|---|
| Fond de page | `--fond` | `#f4f6f9` | — |
| Carte, panneau | `--surface` / `--surface-douce` | `#ffffff` / `#f8fafc` | — |
| Survol d'une ligne, d'un bouton | `--surface-survol` | `#f1f5fb` | — |
| Bordure | `--bordure` / `--bordure-forte` | `#e3e8ef` / `#cbd3df` | décor |
| Contour des champs | `--bordure-champ` | `#858fa0` | 3,26:1 (≥ 3:1, WCAG 1.4.11) |
| Texte | `--texte` | `#18202f` | 16,3:1 |
| Texte secondaire | `--texte-doux` | `#5b6577` | 5,9:1 |
| Texte discret | `--texte-faible` | `#687182` (avant `#8a93a3`, 3,1:1) | 4,9:1 sur blanc, 4,5:1 sur le fond |
| Action, lien | `--accent` (`--accent-fort`, `--accent-doux`) | `#2563eb` | 5,2:1 (texte blanc sur accent : 5,2:1) |
| Succès | `--vert` / `--vert-doux` | `#047857` (avant `#0e9f6e`, 3,4:1) | 5,5:1 |
| Attention | `--orange` / `--orange-doux` | `#c2410c` | 5,2:1 |
| Alerte | `--rouge` / `--rouge-doux` | `#c81e1e` | 5,7:1 |
| Barre latérale | `--menu`, `--menu-texte`, `--menu-titre`, `--menu-survol`, `--menu-actif`, `--menu-bordure` | `#0f172a`, `#b6c0d1`, `#8794a8`… | 9,7:1 et 5,8:1 |

Thème sombre (`:root[data-theme='sombre']`, ou `auto` + appareil en sombre) : mêmes rôles, valeurs foncées
(texte 13,9:1, texte doux 7,9:1, texte discret 4,8:1, vert `#34c48f` 7,5:1). Contraste élevé
(`data-contraste='eleve'`) : textes et bordures plus foncés, liens soulignés, focus 3 px.

**Couleur de marque (white-label)** : `--accent`, `--accent-fort`, `--accent-doux` sont redéfinies à l'exécution par
`appliquerMarque` (`src/noyau/marque.js`) depuis la **palette contrôlée** (`COULEURS_MARQUE`, toutes lisibles avec du
texte blanc). Jamais `#2563eb` en dur dans un composant : toujours `var(--accent…)` (l'avatar et les onglets suivaient
encore des couleurs en dur avant Elite UX 2.0). Les couleurs d'état ne changent jamais avec la marque.

### Typographie
Police Inter (repli système). Échelle : `--texte-xs` 12 · `--texte-sm` 13 · `--texte-base` 14 (texte courant) ·
`--texte-md` 15 · `--texte-lg` 17 · `--texte-xl` 20 · `--texte-2xl` 24 · `--texte-3xl` 28 px. Poids `--poids-normal`
400 · `--poids-moyen` 500 · `--poids-fort` 600 · `--poids-gras` 700. Chiffres en colonnes : `font-variant-numeric:
tabular-nums` (classes `.montant`, `.nombre`, tableaux). Rien de lisible sous 12 px.

### Espaces, rayons, ombres, tailles
- Espaces : `--espace-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 px.
- Rayons : `--rayon-petit` 6 · `--rayon` 10 · `--rayon-grand` 14 · `--rayon-plein` (pastilles).
- Ombres : `--ombre` (bouton, tuile), `--ombre-carte` (carte, tableau), `--ombre-forte` (modale, menu flottant).
- Tailles : `--cible` 40 px, `--cible-tactile` 48 px, `--barre-haut` 60 px, `--menu-largeur` 252 px, `--page-max` 1320 px.
- Plans : `--plan-barre` 20, `--plan-menu` 40, `--plan-modale` 50, `--plan-notification` 60.
- États : `--anneau-focus` (halo des champs), `--opacite-desactive` 0,55.

### Points de rupture
420 px (petit téléphone) · 640 px (téléphone : tableaux en fiches, barre du haut sur deux rangées) ·
860 px (tablette debout : menu en tiroir, barre d'onglets en bas, barre « Encaisser » fixe) · 1100 px (tablette couchée).
Les variables CSS ne vont pas dans `@media` : reprendre ces valeurs telles quelles.

## Coquille et navigation
- **Barre latérale** groupée (registre des modules : module actif + permission, seule source du menu) ; en tête
  « Favoris » (écrans épinglés), puis le menu court et « Plus d'outils ».
- **Barre du haut** : menu (tablette et téléphone), **Retour** (sous-écran → écran parent), fil d'Ariane (établissement
  › écran ; au téléphone l'établissement en petit au-dessus du titre), **étoile** (épingler l'écran, 8 au plus),
  Rechercher (Ctrl+K), Créer (N), sélecteurs d'établissement et de Hub, notifications, profil.
  Téléphone (< 640 px) : deux rangées, rien ne sort de l'écran.
- **Barre d'onglets du téléphone** (< 860 px, sauf caisse plein écran) : 4 écrans (favoris d'abord, puis Accueil,
  Caisse, Salle, Hôtel, Ventes…) + « Menu ». Libellés entiers sur deux lignes au besoin.
- **Clavier** : Ctrl+K (rechercher, favoris et récents en tête), N (créer), Alt+1…9 (n-ième écran du menu),
  ? (aide des raccourcis), flèches dans les onglets et les graphiques, Entrée ou Espace sur une ligne de liste.
- Préférences de l'appareil (thème, contraste, taille du texte, cibles tactiles, animations) : `src/noyau/affichage.js`.

## Composants (inventaire)
| Composant | Fichier | Usage | À ne pas faire |
|---|---|---|---|
| `Bouton` | composants.jsx | `variante` principal / secondaire / danger / discret ; `petit` ; `chargement` | deux boutons principaux |
| `Icone` | composants.jsx | icônes SVG du jeu interne | icône seule sans `aria-label` |
| `Champ` | composants.jsx | libellé, `aide`, `erreur` (sous le champ, annoncée) ; relie `aria-describedby` et `aria-invalid` ; `*` automatique si `required` | message d'erreur loin du champ |
| `ChiffreCle` | composants.jsx | chiffre clé qui tient dans sa case : taille réduite puis forme courte (« 125,8 M FCFA ») avec la valeur complète en dessous | `text-overflow: ellipsis` sur un montant |
| `StatCard` | composants.jsx | chiffre clé cliquable (`valeur`, `valeurCourte` facultative) dans `.grille-stats` | plus de 6 par ligne |
| `Kpi` | tableau_de_bord/cockpit.jsx | indicateur : titre, période, valeur, unité, évolution (flèche + signe + %), « Indisponible » | évolution par la couleur seule |
| `GraphiqueBarres` | composants.jsx | barres à la largeur réelle, valeur au toucher / survol / flèches, résumé lu par les lecteurs d'écran ; prop `vide` | deux échelles |
| `PageHeader`, `EnTete` | composants.jsx | fil, titre, sous-titre, badges, actions | titre technique |
| `Section` | composants.jsx | bloc titré | sections imbriquées |
| `DataTable` | composants.jsx | recherche, filtres, tri, pagination, export, impression ; nombre de résultats annoncé ; fiches au téléphone (montants sur une ligne) | tableau sans état vide |
| `Tabs` / `Onglets` | composants.jsx | sous-parties d'un écran ; flèches, Début, Fin | plus de 8 onglets |
| `Recherche` | composants.jsx | champ de recherche avec icône | — |
| `MenuActions` | composants.jsx | actions secondaires ••• | y mettre l'action principale |
| `Modale`, `ModaleMotif`, `Confirmation` | composants.jsx | saisie courte, motif obligatoire, action sensible | `window.confirm` ; modale qui bloque un encaissement |
| `Badge`, `StatusBadge` | composants.jsx | état court | couleur sans texte |
| `EmptyState`, `Vide`, `Squelette`, `Chargement`, `Erreur` | composants.jsx | états | écran blanc |
| `BandeauBrouillon` | communs.jsx | brouillon repris, conflit, « Modifications non enregistrées, gardées en brouillon sur cet appareil » | `beforeunload` |
| `BoutonFavori`, `BoutonRetour`, `MenuFavoris`, `BarreOngletsMobile`, `useRaccourcisNavigation` | Navigation.jsx | navigation (voir plus haut) ; n'affichent que des écrans déjà autorisés | ajouter un écran hors registre |
| `Palette` | Palette.jsx | Ctrl+K : favoris, récents, écrans, actions | — |

Formats : `formatMontant` (valeur complète, toujours), `formatMontantCourt` (« 1,25 M FCFA », dès 100 000, seulement
en complément de la valeur complète), `formatDate`, `formatQuantite` (`src/noyau/format.js`).

## Montants longs : la règle
Tests de référence : 0, 500, 25 000, 1 250 000, 125 750 000 XAF et des milliards.
1. Toujours sur **une ligne** (`white-space: nowrap`, classes `.montant`, `.nombre`, cellules `td.nombre`).
2. Dans une case étroite (indicateur, carte) : `ChiffreCle` réduit la taille (paliers 1 et 2), puis affiche la forme
   courte en grand **et** la valeur complète en petit dessous (palier 3). La valeur complète reste le texte lu par les
   lecteurs d'écran et par les tests ; elle est aussi dans `title`.
3. Dans une liste au téléphone : une fiche par ligne (libellé à gauche, montant à droite), jamais de défilement
   horizontal pour voir un prix.
4. Jamais `text-overflow: ellipsis` ni `overflow-wrap: anywhere` sur un montant.

## Formulaires
Champs regroupés par sujet ; obligatoires marqués `*` (automatique avec `required`) ; aide courte sous le libellé ;
erreur sous le champ, en rouge **avec** une icône et le texte, annoncée (`role="alert"`) ; brouillon automatique
(`src/noyau/brouillons.js`) et mention « Modifications non enregistrées » tant que ce n'est pas enregistré.

## Libellés imposés
- Montants contractuels (licences) : « Activité contractuelle », jamais « encaissé ».
- Rôles : Responsable d'établissement, Responsable, Responsable Hub, Gestionnaire dépôt, Caissier, Comptable, Lecteur ;
  plateforme : Super Admin, Admin, Support.
- Hub : « Point de vente », « Dépôt », « Mixte ».

## CSS des modules
Le CSS d'un module est chargé pour tout le logiciel. Jamais de sélecteur nu `body`, `html` ou `*` dans un fichier de
module ; toute règle `@media print` passe sous `body.<classe>`. Gardé par `tests/impression.test.js` et
`tests/elite_ux.test.jsx`.

## Animations (Elite Motion System)
Jetons de durée, de courbe et de distance, niveaux (Complètes / Équilibrées / Légères / Réduites), mouvement réduit de
l'appareil respecté : [`docs/motion/`](motion/MOTION_STRATEGY.md) (code : `src/motion/`). Seulement `opacity` et
`transform` ; durées par les variables `--ems-*` ; jamais de compteur au premier affichage ni dans la caisse ; rien qui
retarde une saisie ou un paiement.
