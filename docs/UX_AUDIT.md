# Audit de l'interface (Elite UX 2.0, 2026-10-21)

Fait sur la démo locale (données fictives) : 21 écrans × 6 largeurs (320, 390, 768, 1024, 1366, 1920 px), lecture du
code (`src/styles.css`, `src/ui/`, modules), contrastes calculés (WCAG 2.2). Mesures brutes : captures « avant » /
« après » hors dépôt (voir le rapport de la PR). État après correction : ✓ corrigé, ◐ en partie, ○ reste à faire.

## Bloquant (empêche de lire ou de faire)
| # | Constat | Où | État |
|---|---|---|---|
| B1 | Montants coupés en deux lignes (« 125 750 » / « 000 FCFA ») : 110 cas | indicateurs du tableau de bord, Accueil, Qui me doit ?, Hubs, Achats | ✓ (`ChiffreCle`, `nowrap` ; 0 cas sur les écrans mesurés hors Qui me doit à 320 px, voir R1) |
| B2 | Montants hors de l'écran, à faire glisser pour les voir : 47 cas | listes Articles, Contacts, Dépenses, Clôtures, tableau de bord | ✓ fiches au téléphone (Articles, Contacts, Dépenses, Clôtures, Équipe, toutes les `DataTable`) |
| B3 | Barre du haut au téléphone : avatar, notifications ou sélecteur de Hub poussés hors de l'écran ; titre de l'écran invisible | toutes les pages < 640 px | ✓ deux rangées, établissement + écran visibles |
| B4 | Texte discret (`--texte-faible` `#8a93a3`, 3,1:1) et vert de succès (`#0e9f6e`, 3,4:1) sous le seuil AA | partout | ✓ `#687182` (4,9:1), `#047857` (5,5:1) |
| B5 | Bouton WhatsApp de l'Accueil : texte blanc sur `#25D366` (2,0:1) | Accueil | ✓ `#0b7a43` (5,4:1) |

## Majeur (gêne au quotidien)
| # | Constat | Où | État |
|---|---|---|---|
| M1 | 1 783 cibles tactiles sous 36 px (menu latéral 32 px, boutons-icônes 36 px, onglets 34 px, puces 30 px, panier 28 px) | partout, surtout caisse | ◐ 40 px partout, 48 px en caisse (recherche, catégories), 44 px dans le panier ; reste des liens texte dans les tableaux |
| M2 | Pas de favoris ni de retour ; au téléphone, tout passe par le tiroir du menu | navigation | ✓ étoile, Favoris en tête du menu, Ctrl+K avec favoris et récents, bouton Retour, barre d'onglets du téléphone, Alt+1…9 |
| M3 | Indicateur : pas de période affichée, évolution par la couleur seule, erreur de calcul affichée « 0 » | tableaux de bord | ✓ période, flèche + signe + « vs période précédente », « Indisponible » |
| M4 | Graphiques : texte minuscule au téléphone (dessin réduit), aucune valeur au toucher, rien pour un lecteur d'écran | tableaux de bord, rapports | ✓ dessin à la largeur réelle, valeur au toucher et au clavier, résumé lu |
| M5 | Erreur de formulaire loin du champ, pas reliée au champ ; obligatoires non marqués | formulaires | ✓ `Champ` : erreur sous le champ, `aria-invalid`, `aria-describedby`, `*` automatique |
| M6 | Contour des champs trop pâle (`#cbd3df`, 1,5:1) | formulaires | ✓ `--bordure-champ` 3,3:1 |
| M7 | « Fermeture de caisse » en bouton principal à côté d'« Encaisser » : deux actions principales | caisse | ✓ secondaire |
| M8 | Une rangée d'onglets du tableau de bord élargissait la page au téléphone | tableau de bord › Commerce | ✓ colonne de page bornée (`minmax(0, 1fr)`) |

## Mineur
| # | Constat | Où | État |
|---|---|---|---|
| m1 | Doublons dans `styles.css` (deux `:root`, `.menu`, `.coquille`, `.page`, `.onglets`, `.bandeau`, `.texte-multiligne`) | styles.css | ✓ fusionnés |
| m2 | Couleurs en dur qui ignorent la marque ou le thème sombre (avatar `#2563eb→#7c3aed`, fond d'onglets `#e9edf3`, survol de ligne) | styles.css | ✓ variables |
| m3 | `.menu-pied { text-align: center }` du menu QR appliqué au pied du menu latéral | styles.css | ✓ limité au menu public |
| m4 | Libellés de la barre du bas coupés par « … » (« Tableau … ») | téléphone | ✓ deux lignes |
| m5 | Onglets : pas de navigation au clavier | partout | ✓ flèches, Début, Fin |
| m6 | Nombre de résultats d'une liste non annoncé | listes | ✓ `aria-live` |
| m7 | Pas d'indication « modifications non enregistrées » (le brouillon existait, invisible) | Contacts, Dépenses, Factures | ✓ mention discrète |
| m8 | Premier chargement : pages publiques et espace partenaire dans le fichier principal | chargement | ✓ chargées à la demande (−71 Ko) |

## Reste à faire (hors de cette mission ou bloqué)
| # | Constat | Pourquoi pas fait |
|---|---|---|
| R1 | Qui me doit ? à 320 px : quelques montants dans le titre de carte encore serrés | corrigé sur les lignes ; titre à revoir sur un vrai téléphone |
| R2 | Paramètres et Abonnement : seulement les styles communs | `Parametres.jsx` était en cours de modification (PR #73, fusionnée pendant la mission) : à reprendre écran par écran |
| R3 | Espace éditeur | hors périmètre (PR #71 le retire) |
| R4 | Liens texte dans les cellules de tableau (« Modifier », « Justificatif ») sous 40 px de haut | à traiter écran par écran |
| R5 | Fichier principal encore lourd (564 Ko, dont ~170 Ko d'espace éditeur) | la PR #71 retire l'espace éditeur |
| R6 | Écrans Salle et Hôtel non mesurés par les captures automatiques (autres profils de démo) | vérifiés par les parcours, pas par les mesures de montants |
