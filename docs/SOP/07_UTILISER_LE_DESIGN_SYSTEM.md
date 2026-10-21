# SOP 07 · Utiliser le design system

Référence : [`docs/DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) (Elite Design System). Composants dans
`src/ui/composants.jsx` et `src/ui/Navigation.jsx`, jetons dans `src/styles.css`.

| Besoin | Composant |
|---|---|
| En-tête de page | `PageHeader` (fil, titre, badges, actions) |
| Chiffre clé | `StatCard` dans `.grille-stats` (ou `ChiffreCle` pour un chiffre isolé) |
| Indicateur de tableau de bord | `Kpi` (`cockpit.jsx`) avec la période |
| Bloc | `Section` |
| Liste | `DataTable` (tri, recherche, fiches au téléphone) ou `.tableau` dans `.tableau-conteneur` |
| Onglets | `Tabs` |
| Champ de formulaire | `Champ` (`aide`, `erreur`, `required` → `*`) |
| Actions secondaires | `MenuActions` (bouton •••) |
| Confirmation d'une action sensible | `Confirmation` (jamais `window.confirm`) |
| Statut | `StatusBadge`, `Badge` |
| Vide / chargement / erreur | `EmptyState`, `Squelette`, `Erreur` ; « Indisponible » pour un chiffre non calculé |
| Graphique simple | `GraphiqueBarres` (prop `vide` si tout est à zéro) |
| Formulaire long | `useBrouillon` + `BandeauBrouillon` (brouillon et « Modifications non enregistrées ») |

Règles :
1. Un seul bouton principal par écran ; vocabulaire métier simple (« Caissier », « Hub », « Responsable d'établissement »).
2. Montants avec `formatMontant`, toujours complets, sur une ligne ; `formatMontantCourt` seulement en complément.
   Dates avec `formatDate`.
3. Couleurs, tailles, espaces : uniquement les variables (`var(--accent)`, `var(--cible)`, `var(--espace-4)`…).
4. Cibles ≥ 40 px (`--cible`), ≥ 48 px en caisse (`--cible-tactile`). Focus visible : ne jamais retirer `outline`.
5. Jamais d'information par la couleur seule. Jamais `text-overflow: ellipsis` sur un montant.
6. CSS d'un module : pas de sélecteur nu `body`, `html` ou `*` ; `@media print` sous `body.<classe>`.
7. Animations : seulement via `src/motion` (`opacity`, `transform`, variables `--ems-*`), rien sur un encaissement.
8. Vérifier à 320, 390, 768 et 1366 px, en thème sombre et au clavier : `node scripts/ux_captures.cjs` sur la démo
   locale (voir `docs/UX_TEST_MATRIX.md`).
