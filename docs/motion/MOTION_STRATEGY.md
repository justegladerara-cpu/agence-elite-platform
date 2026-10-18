# Stratégie d'animation (Elite Motion System, SaaS)

Périmètre : la plateforme SaaS (ce dépôt) uniquement. Le site public et le CRM interne sont hors périmètre.

## Ce qu'on cherche
Une interface qui **répond** : chaque geste a un retour immédiat (appui, survol, focus), chaque écran arrive sans
saut, chaque changement de chiffre se voit. Le mouvement sert à comprendre ce qui vient de se passer, jamais à
décorer ni à faire attendre.

## Règles
1. **La donnée d'abord.** Une animation ne retarde jamais une saisie, un enregistrement, un total ou un paiement.
   Un état « Patientez… » n'existe que pendant la vraie requête (`Bouton chargement`).
2. **Jamais de chiffre faux.** Un compteur ne compte pas depuis 0 au premier affichage ; il glisse seulement quand
   la valeur change, et sa dernière image est la valeur reçue elle-même. Pas de compteur dans la caisse.
3. **Léger.** CSS d'abord (`transition`, `@keyframes`) ; seulement `opacity` et `transform` ; aucune boucle ajoutée ;
   aucun `will-change` permanent ; aucune bibliothèque ajoutée (voir « Dépendances » ci-dessous).
4. **Court.** 80 à 320 ms (420 ms au plus en « Complètes »). Entrée : courbe de sortie douce. Rien en sortie qui
   garde un élément à l'écran après sa fermeture.
5. **Respect de la personne.** « Réduire les animations » du système est toujours respecté ; un réglage par appareil
   (Mon profil › Préférences › Animations : Comme l'appareil / Complètes / Équilibrées / Légères / Réduites).
6. **Marque blanche.** Uniquement les variables (`--accent`, `--accent-doux`…) : la couleur du client suit.
7. **Caisse : micro-interactions seulement.** Appui de tuile, ligne de panier qui s'éclaire, compteur de tuile.
   Le total, la monnaie, le reste dû, Encaisser et Valider ne sont jamais animés.
8. **Un interrupteur.** `data-animations` sur `<html>` ; `ACTIVE = false` dans `src/motion/preferences.js` coupe
   tout ; retirer l'import de `motion.css` dans `src/main.jsx` revient à l'interface d'avant.

## Dépendances : décision
| Bibliothèque | Décision | Raison |
|---|---|---|
| motion (ex-Framer Motion) | **Refusée** | Utile pour les animations de sortie et de mise en page ; ici, les sorties sont volontairement absentes (voir ROADMAP) et tout le reste se fait en CSS. ~30 à 60 Ko gzip pour peu de gain. |
| GSAP | Refusée | Moteur de chronologie pour sites vitrines ; aucun besoin dans un outil de gestion. |
| Three.js | Refusée | 3D : hors sujet, très lourd. |
| ECharts / Chart.js | Refusée | Les graphiques sont des SVG maison (`GraphiqueBarres`) : animés en CSS pour 0 Ko. |
| Lenis (défilement doux) | Refusée | Détourne le défilement natif, nuit à l'accessibilité et aux longues listes. |

Résultat : **0 dépendance ajoutée**, +2,6 Ko gzip au total sur la version de production (JS +1,0 Ko, CSS +1,6 Ko) (voir MOTION_PERFORMANCE.md).
