# Architecture (Elite Motion System)

```
src/motion/
  preferences.js   niveau d'animation : choix de l'appareil (localStorage « ae-animations »), système, interrupteur ACTIVE
  motion.css       jetons + toutes les règles d'animation (importé après styles.css dans src/main.jsx)
  nombre.js        useNombreAnime : compteur qui glisse quand la valeur change, fin exacte
  NombreAnime.jsx  composant d'affichage d'un nombre formaté (formateur de l'écran, ex. FCFA)
  lignes.js        useLignesNouvelles : repère les lignes ajoutées après le premier affichage
  index.js         point d'entrée
```

## Flux
1. `src/main.jsx` appelle `appliquerAnimations()` **avant le premier affichage** : `<html data-animations="…">`.
2. `suivreSysteme()` écoute `prefers-reduced-motion` (changement en direct) et `visibilitychange`
   (`data-page-cachee` met en pause rouets et squelettes quand l'onglet est caché).
3. Les règles de `motion.css` lisent `data-animations` (jetons par niveau ; les entrées sont posées sous
   `:root:not([data-animations='reduit'])`).
4. Les deux hooks lisent le niveau courant au moment de l'animation (`niveauCourant()`) : pas de contexte React,
   pas de nouvel affichage de toute l'application quand le réglage change.
5. Mon profil › Préférences › **Animations** appelle `enregistrerChoixAnimations()`.

## Ce que l'EMS ne touche pas
Logique métier, appels Supabase, permissions, licences, stock, argent, authentification, impression : aucun fichier
de ces domaines n'est modifié. Les seuls composants modifiés sont des composants d'affichage
(`src/ui/composants.jsx` : `Bouton`, `Modale`, `DataTable`, `GraphiqueBarres` ; `Kpi` du tableau de bord ;
le réglage dans `App.jsx`).

## Désactiver
- Pour un appareil : Mon profil › Préférences › Animations › « Réduites ».
- Pour tout le monde, sans retirer le code : `export const ACTIVE = false;` dans `src/motion/preferences.js`
  puis publier. Niveau forcé à « réduit » : plus aucun mouvement (y compris les petites animations qui existaient
  avant l'EMS), plus de compteur ni de surlignage.
- Retour à l'interface d'avant, à l'identique : `ACTIVE = false` **et** suppression de la ligne
  `import './motion/motion.css';` dans `src/main.jsx`. Restent seulement le correctif de focus de `Modale` et
  l'attribut `aria-busy` de `Bouton`, sans effet visuel.

## Retour arrière
`git revert <commit de fusion de la PR>` puis publication normale (SOP 16). Aucune migration, aucune donnée :
le retour arrière est sans risque. La préférence `ae-animations` restée dans un navigateur est simplement ignorée.
