# Journal (Elite Motion System)

## 2026-10-18 — EMS v1 (PR « Elite Motion System »)
- Ajout de `src/motion/` (jetons, niveaux, compteur exact, lignes nouvelles) et du réglage Mon profil › Préférences ›
  Animations (par appareil).
- Boutons, champs, onglets, menu latéral, pages, cartes, indicateurs, fenêtres, menus, notifications, squelettes,
  états vides et d'erreur, tableaux (ligne ajoutée), graphiques SVG, caisse (micro-interactions) : voir
  MOTION_COMPONENTS.md.
- Correctifs : focus de `Modale` qui revenait au premier champ quand le parent se ré-affichait ; voile qui glissait
  avec la fenêtre ; squelettes trop clairs en thème sombre ; boutons sans focus clavier visible ; pile de
  notifications illimitée.
- Mouvement réduit étendu à toute l'interface (avant : squelette et survol des indicateurs seulement).
- Mesure reproductible : `scripts/mesure_motion.cjs` ; parcours navigateur : `scripts/parcours_motion.cjs` (CI).
- Aucune dépendance ajoutée, aucune migration, aucune logique métier modifiée.
