# Design system de la plateforme

Référence unique pour l'interface (humains et IA). Code : `src/ui/composants.jsx` et `src/styles.css`.
Procédure : [SOP 07](SOP/07_UTILISER_LE_DESIGN_SYSTEM.md).

## Principes
1. **Simple pour le petit commerce** : un seul Hub = aucune notion de Hub à l'écran ; vocabulaire métier
   (Caissier, Responsable d'établissement, Hub, Ticket Z), jamais technique.
2. **Une action principale par écran** (bouton bleu) ; le reste dans le menu •••.
3. **Toujours un état** : chargement (`Squelette`), vide (`EmptyState` qui dit quoi faire), erreur (`Erreur` en français simple).
4. **Rien d'irréversible sans `Confirmation`** ; rien d'irréversible du tout sur les données financières.
5. **Mobile d'abord pour la caisse** : utilisable à 390 px, cibles tactiles ≥ 40 px.

## Couleurs (variables CSS, `:root`)
| Rôle | Variable | Valeur |
|---|---|---|
| Fond de page | `--fond` | `#f4f6f9` |
| Carte, panneau | `--surface` | `#ffffff` |
| Bordure | `--bordure` / `--bordure-forte` | `#e3e8ef` / `#cbd3df` |
| Texte | `--texte` / `--texte-doux` / `--texte-faible` | `#18202f` / `#5b6577` / `#8a93a3` |
| Action, lien | `--accent` (`--accent-fort`, `--accent-doux`) | `#2563eb` |
| Succès | `--vert` / `--vert-doux` | `#0e9f6e` |
| Attention | `--orange` / `--orange-doux` | `#c2410c` |
| Alerte | `--rouge` / `--rouge-doux` | `#c81e1e` |
| Barre latérale | `--menu`, `--menu-texte`, `--menu-actif` | `#0f172a`, `#b6c0d1`, `#1f2b42` |

Police Inter (repli système). Rayon `--rayon` 10 px, cartes `--rayon-grand` 14 px. Barre du haut 60 px.
Les couleurs d'état ne servent qu'aux états, toujours accompagnées d'un mot (badge).

## Coquille
- **Barre latérale** groupée : Pilotage · Vente · Catalogue et stock · Relations · Organisation ;
  en tête, l'espace Agence Elite pour les administrateurs plateforme.
- **Barre du haut** : fil d'Ariane (publié par `PageHeader`), sélecteur d'établissement (si plusieurs),
  sélecteur de Hub (si plusieurs Hubs actifs, avec « Tous les Hubs »), profil (Mon compte, Se déconnecter).
- Mobile (< 860 px) : barre latérale en tiroir, bouton menu.

## Composants
| Composant | Usage | À ne pas faire |
|---|---|---|
| `PageHeader` | fil, titre, sous-titre, badges, actions | titre technique |
| `StatCard` (dans `.grille-stats`) | chiffre clé cliquable vers le détail | plus de 6 par ligne |
| `Section` | bloc titré | imbriquer des sections |
| `DataTable` | liste avec recherche, tri, pagination, actions | tableau sans état vide |
| `Tabs` | sous-parties d'une fiche | plus de 8 onglets |
| `MenuActions` | actions secondaires ••• | y mettre l'action principale |
| `Confirmation` | action sensible (suspendre, archiver, annuler) | `window.confirm` |
| `Badge`, `StatusBadge` | état court | couleur sans texte |
| `GraphiqueBarres` | évolution simple ; prop `vide` si tout est à 0 | deux échelles sur un graphique |
| `Modale` | saisie courte | formulaire de plus d'un écran |

## Libellés imposés
- Montants contractuels (licences) : « Activité contractuelle », jamais « encaissé ».
- Rôles : Responsable d'établissement, Responsable, Responsable Hub, Gestionnaire dépôt, Caissier, Comptable, Lecteur ;
  plateforme : Super Admin, Admin, Support.
- Hub : « Point de vente », « Dépôt », « Mixte ».
