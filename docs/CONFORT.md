# Confort d'utilisation (transversal)

Ajouté le 2026-10-09 (lot 1 du plan `docs/AMELIORATIONS/PROPOSITIONS_2026-10-09.md`). Ces fonctions valent pour tous
les modules ; aucune ne donne de droit : la base reste seule juge.

## Recherche universelle (Ctrl+K)
- Ouverture : **Ctrl+K** (ou ⌘K), touche **/**, ou le bouton « Rechercher… » de la barre du haut.
- Trois familles de résultats :
  - **Aller à** : les écrans auxquels la personne a accès (même règle que le menu) ;
  - **Créer** : les créations rapides permises (voir plus bas) ;
  - **Données** de l'établissement actif : articles (nom, référence, code-barres exact), contacts (nom, téléphone,
    e-mail), ventes, devis / factures / avoirs, réservations et chambres d'hôtel, tables, employés, tickets,
    opportunités, projets, commandes fournisseur, rendez-vous.
- Fonction `recherche_universelle(p_etablissement_id, p_texte, p_limite)` (migration `20261010000101`), **security
  invoker** : la RLS de chaque table s'applique (droits, Hubs, isolement) ; chaque famille n'est en plus cherchée que si
  la personne peut ouvrir l'écran correspondant (`lecture_autorisee`). 2 caractères au moins ; `%` et `_` sont des
  caractères ordinaires ; 5 résultats par famille.
- Si la fonction n'existe pas encore en base, la palette propose seulement écrans et créations (aucune erreur).
- Recherche sans accents ni majuscules pour les écrans et créations (« depense » trouve « Dépense »).

## Création rapide (bouton « + », touche N)
Liste `src/noyau/actionsRapides.js` : vente, article, contact, dépense, devis, facture, commande fournisseur, demande
d'achat, opportunité, rendez-vous, ticket, réservation d'hôtel, réservation de table, employé, projet. Chaque action
ouvre un écran existant déjà prêt à créer ; elle n'apparaît que si le module est actif et la permission accordée.

## Raccourcis clavier
Ctrl+K ou / (rechercher), N ou + (créer), ? (aide des raccourcis), Échap (fermer), ↑ ↓ Entrée (palette).
Ignorés pendant la saisie dans un champ, sauf Ctrl+K.

## Affichage sur cet appareil (Mon profil › Préférences)
Thème clair / sombre / comme l'appareil, taille du texte (normal, grand, très grand), contraste élevé, gros boutons
(48 px, pour caisse et salle tactiles). Mémorisé dans le navigateur (`ae-affichage`), appliqué avant le premier
affichage. Les tickets et documents A4 restent noir sur blanc.

## Listes : export et impression
- Toute liste `DataTable` avec outils (recherche ou filtres) propose **Exporter** (CSV « ; » + BOM, ouvert directement
  par Excel) et **Imprimer** (toutes les lignes filtrées, sans menu ni barres).
- Les montants et quantités sortent en nombre (valeur de tri), le reste tel qu'affiché. Une colonne se règle avec
  `exporter: (ligne) => …` ou s'exclut avec `exporter: false` ; `exportable={false}` retire le bouton CSV d'une liste
  qui a déjà son propre export (factures, achats, CRM…).
- Ventes : bouton « Exporter » (numéro, date, Hub, origine, contact, sous-total, remise, total, payé, état).

## Application installable
`public/manifest.webmanifest` + icônes neutres (`public/icones/`) : « Installer » / « Ajouter à l'écran d'accueil »
depuis le navigateur. Pas de mode hors ligne (aucun service worker) ; l'icône est la même pour tous les clients.

## Démarrage plus rapide
Les écrans des modules sont chargés à la demande (`React.lazy` dans chaque manifeste, `Suspense` dans la coquille) :
le fichier principal passe de 897 ko à 433 ko (build du 2026-10-09).

## Limites connues
- Pas de filtres enregistrés ni de choix des colonnes.
- Les listes en tableau simple (articles, contacts, dépenses, clôtures) n'ont pas encore l'export générique.
- Pas d'icône d'application par client (white-label) ni de mode hors ligne.
- La recherche de données ne couvre pas encore les documents, les commandes de la boutique ni les notes.

## Tests
`tests/recherche_universelle.test.js` (droits, isolement, saisie, anonyme), `tests/confort.test.jsx` (actions, affichage,
export, découpage du code), parcours navigateur (`palette-ecran`, `palette-donnee`, `creation-rapide`, `liste-export`,
`theme-sombre`).
