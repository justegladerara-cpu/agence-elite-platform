# SOP 07 · Utiliser le design system

Référence : [`docs/DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) (Elite Design System). Composants dans `src/ui/composants.jsx`.

| Besoin | Composant |
|---|---|
| En-tête de page | `PageHeader` (fil, titre, badges, actions) |
| Chiffre clé | `StatCard` dans `.grille-stats` |
| Bloc | `Section` |
| Liste | `DataTable` (tri, recherche) ou `.tableau` dans `.tableau-conteneur` ; ajouter `empilable` + `data-label` sur chaque cellule pour des fiches sur téléphone |
| Champ de formulaire | `Champ` (`aide`, `erreur` ; `required` sur le contrôle = astérisque) |
| Indicateur de tableau de bord | `Kpi` / `GrilleKpis` (passer `periode`) |
| Onglets | `Tabs` |
| Actions secondaires | `MenuActions` (bouton •••) |
| Confirmation d'une action sensible | `Confirmation` (jamais `window.confirm`) |
| Statut | `StatusBadge`, `Badge` |
| Vide / chargement / erreur | `EmptyState`, `Squelette`, `Erreur` |
| Graphique simple | `GraphiqueBarres` (prop `vide` si tout est à zéro) |

Règles : un seul bouton principal par écran ; jetons `var(--…)` au lieu de valeurs en dur ; jamais de `…` (ellipsis) sur un montant ;
cibles ≥ 40 px (`--cible`), ≥ 48 px en caisse (`--cible-caisse`) ; jamais d'information par la couleur seule ; vocabulaire métier simple (« Caissier », « Hub »,
« Responsable d'établissement ») ; montants avec `formatMontant` ; dates avec `formatDate`.
