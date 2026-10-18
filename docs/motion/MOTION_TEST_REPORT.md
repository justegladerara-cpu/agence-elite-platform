# Rapport de tests (Elite Motion System)

| Suite | Commande | Résultat |
|---|---|---|
| Unitaires, avant | `npm test` (`main` `74bfdef`) | 115 fichiers, 1 034 tests : tous verts |
| Unitaires, après | `npm test` | 116 fichiers, 1 054 tests : tous verts (+20 : `tests/motion.test.jsx`) ; CI verte après fusion de `main` |
| Build | `npm run build`, `npm run build:demo` | OK |
| Parcours navigateur (tous domaines, bureau, tablette, téléphone, console) | `npm run test:e2e` | OK, aucune erreur console |
| Parcours restaurant, éditeur | `scripts/parcours_restaurant.cjs`, `scripts/parcours_editeur.cjs` | OK |
| **Parcours animations** (nouveau, en CI) | `scripts/parcours_motion.cjs` | 7/7 OK |

## `tests/motion.test.jsx` (19 tests)
- Préférences : « auto » suit le système ; « Réduire les animations » → réduit ; choix explicite plafonné à « léger »
  si le système refuse le mouvement ; valeur abîmée ou stockage bloqué → « auto » ; niveau posé sur `<html>`.
- Onglet caché : pause des boucles ; arrêt du suivi : écouteurs retirés.
- Compteur : jamais de comptage au premier affichage ; valeurs intermédiaires entre les deux bornes et entières pour
  FCFA ; **dernière valeur = valeur reçue** (y compris texte « 12.25 » venu de la base) ; interruption : repart de la
  valeur affichée ; réduit/léger : valeur immédiate ; démontage : image annulée ; format FCFA de l'application.
- Lignes nouvelles : rien au premier chargement, ajout surligné, rien au-delà de 5 lignes ni en réduit.
- `Modale` : le focus reste dans le champ quand le parent se ré-affiche, Échap appelle le dernier `onFermer`
  (**ce test échoue sur l'ancien code**). `Bouton` : `aria-busy` et désactivé pendant la requête.

## `scripts/parcours_motion.cjs` (Chromium, démo)
1. Niveau « équilibré » par défaut. 2. Entrée animée d'une fenêtre. 3. **Fermeture de caisse : le champ garde le focus
après la relecture de la caisse** (sur `main` : le focus partait sur le bouton « Fermer », vérifié). 4. Réglage
« Animations » appliqué et gardé après rechargement. 5. Téléphone avec « Réduire les animations » : niveau réduit,
aucune animation qui dure. 6. Menu en tiroir. 7. Caisse au téléphone sans défilement horizontal.
Correctif CI : l'étape 6 lisait la position du tiroir dans l'image où démarre la transition (0,01 ms) : elle attend
maintenant la position ouverte.

## Captures (démo fictive, non versionnées)
Bureau 1366×820 et téléphone 390×844 : connexion, tableau de bord, articles, fenêtre, caisse avec panier, menu mobile —
dossiers `avant/` et `apres/` du bloc-notes de la session.

## Non fait
Vrais téléphones, lecteurs d'écran réels, production (`saas.agence-elite.fr` injoignable depuis le conteneur).
