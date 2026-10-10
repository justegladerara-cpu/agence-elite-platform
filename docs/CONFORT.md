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
- Articles, contacts, dépenses et tickets Z : bouton « Exporter » (la liste affichée, avec ses filtres).

## Téléphone
Sur écran de moins de 640 px, en-têtes triables, liens d'action, choix de période et pastilles de couleur font au
moins 36 px de haut (audit : 0 bouton trop petit sur Présences, Congés, Projets, Factures, Achats, Équipe, Chambres,
tableau de bord et écrans éditeur).

## Application installable
`public/manifest.webmanifest` + icônes neutres (`public/icones/`) : « Installer » / « Ajouter à l'écran d'accueil »
depuis le navigateur. Pas de mode hors ligne (aucun service worker) ; l'icône est la même pour tous les clients.

## Démarrage plus rapide
Les écrans des modules sont chargés à la demande (`React.lazy` dans chaque manifeste, `Suspense` dans la coquille) :
le fichier principal passe de 897 ko à 433 ko (build du 2026-10-09).

## Mobile et réseau instable (lot G, 2026-10-10, sans migration)
- **Brouillons automatiques** (`src/noyau/brouillons.js`, `useBrouillon`) : nouvelle dépense, fiche contact, devis et
  facture (création et modification) sont gardés sur l'appareil pendant la saisie, par personne et par établissement.
  À la réouverture : « Brouillon du … repris » et « Repartir de zéro ». Effacé à l'enregistrement, après 7 jours et
  **à la déconnexion** (un brouillon peut contenir des données de clients). Rien n'est envoyé au serveur. La photo du
  justificatif d'une dépense n'est pas gardée (trop lourde).
- **Conflit** : si le contact ou le document a été modifié par quelqu'un d'autre depuis le brouillon (`modifie_le`), le
  brouillon n'est pas appliqué tout seul : « Garder la version enregistrée » ou « Reprendre mon brouillon ».
- **Stockage plein** : si l'appareil refuse d'écrire, un message demande d'enregistrer tout de suite ou de libérer de la place.
- **Hors connexion** : bandeau « Hors connexion : rien ne peut être enregistré pour l'instant… », puis « Connexion
  rétablie ». Il n'y a **pas** de file d'attente hors ligne : un enregistrement tenté sans réseau échoue avec son message
  habituel et le formulaire reste ouvert (et en brouillon).
- **Nouvelle version** : chaque construction écrit `version.json` (identifiant du commit Cloudflare Pages, sinon
  l'heure de construction ; jamais mis en cache, voir `public/_headers`). L'application le relit toutes les 5 minutes
  et au retour sur l'onglet ; si la version a changé : « Une nouvelle version est disponible… Recharger ». Jamais de
  rechargement imposé.

## Photos et envois de fichiers (lot G2, 2026-10-10, sans migration)
- **Recadrage** (`src/ui/Recadrage.jsx`) : la photo du justificatif d'une dépense (Nouvelle dépense › Photo du
  justificatif, ou « Recadrer » ensuite) et une photo jointe à une fiche (Ajouter un document › « Recadrer la photo »)
  se recadrent avant l'envoi : quatre coins à faire glisser (souris, doigt, ou flèches du clavier sur un coin), zone
  déplaçable, « Pivoter » par quart de tour, « Tout garder ». Tout se fait sur l'appareil ; seule l'image recadrée et
  réduite est envoyée (1000 px pour une dépense, 1600 px pour une pièce jointe, en JPEG).
- **Reprise après coupure** (`src/noyau/envoi.js`) : une pièce jointe (Ajouter un document) et un fichier déposé par un
  client dans son espace se renvoient tout seuls quand le réseau revient (« Connexion perdue : l'envoi reprendra tout
  seul… », 4 essais, bouton Annuler). Avant chaque nouvel essai, l'écran vérifie que le serveur n'a pas déjà reçu le
  fichier (réponse perdue) : pas de doublon. Une erreur de la base (type refusé, fichier trop lourd) n'est jamais
  renvoyée.

## Limites connues
- Pas de détection automatique des bords du document ni de redressement de perspective : le recadrage est manuel.
- Un fichier part en un seul envoi (3 Mo au plus) : la reprise renvoie le fichier entier, pas la partie manquante.
  La reprise ne survit pas à la fermeture de la page. L'enregistrement d'une dépense avec sa photo ne reprend pas tout
  seul (le formulaire reste ouvert et en brouillon, la photo doit être rechoisie).
- Pas de filtres enregistrés ni de choix des colonnes.
- Pas d'icône d'application par client (white-label) ni de mode hors ligne.
- La recherche de données ne couvre pas encore les documents, les commandes de la boutique ni les notes.
- Pas de palette ni de bouton « + » dans l'espace Agence Elite (super admin) : ils servent dans un établissement.

## Tests
`tests/recherche_universelle.test.js` (droits, isolement, saisie, anonyme), `tests/confort.test.jsx` (actions, affichage,
export, découpage du code), parcours navigateur (`palette-ecran`, `palette-donnee`, `creation-rapide`, `liste-export`,
`theme-sombre`, `export-listes-simples`, `recadrage-photo`), `tests/recadrage_envoi.test.js` (zone de recadrage,
reprise, absence de doublon, annulation) et parcours éditeur (`scripts/parcours_editeur.cjs`, lancé en CI).
