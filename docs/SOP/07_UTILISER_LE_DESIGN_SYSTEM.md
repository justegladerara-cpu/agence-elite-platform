# SOP 07 · Utiliser le design system

Référence : [`docs/DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md). Composants dans `src/ui/composants.jsx`.

| Besoin | Composant |
|---|---|
| En-tête de page | `PageHeader` (fil, titre, badges, actions) |
| Chiffre clé | `StatCard` dans `.grille-stats` |
| Bloc | `Section` |
| Liste | `DataTable` (tri, recherche) ou `.tableau` dans `.tableau-conteneur` |
| Onglets | `Tabs` |
| Actions secondaires | `MenuActions` (bouton •••) |
| Confirmation d'une action sensible | `Confirmation` (jamais `window.confirm`) |
| Statut | `StatusBadge`, `Badge` |
| Vide / chargement / erreur | `EmptyState`, `Squelette`, `Erreur` |
| Graphique simple | `GraphiqueBarres` (prop `vide` si tout est à zéro) |

Règles : un seul bouton principal par écran ; vocabulaire métier simple (« Caissier », « Hub »,
« Responsable d'établissement ») ; montants avec `formatMontant` ; dates avec `formatDate`.
