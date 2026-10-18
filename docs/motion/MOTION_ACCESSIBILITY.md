# Accessibilité du mouvement (Elite Motion System)

| Exigence | Réponse |
|---|---|
| `prefers-reduced-motion: reduce` | Réglage « Comme l'appareil » (défaut) → niveau **réduit** : aucune animation ni transition qui dure (0,01 ms), rouets et squelettes figés, aucun compteur, aucun surlignage. Suivi en direct (changement du réglage système sans recharger). |
| Choix explicite malgré le réglage système | « Complètes » ou « Équilibrées » descendent à **légères** (fondus courts, aucun déplacement) : jamais de mouvement pour qui l'a refusé sur son appareil. |
| Réglage dans l'application | Mon profil › Préférences › **Animations** (par appareil, comme le thème) : Comme l'appareil, Complètes, Équilibrées, Légères, Réduites. |
| Focus visible | Anneau `2px var(--accent)` sur boutons, liens, onglets, puces, tuiles de caisse (`:focus-visible` : clavier seulement). |
| Focus dans les fenêtres | Premier champ au début, piège Tab/Maj+Tab, Échap ferme, retour au bouton d'origine : inchangés. **Corrigé** : le focus ne saute plus au premier champ quand l'écran derrière se rafraîchit. |
| Chiffres | Jamais de faux chiffre au premier affichage ; glissement seulement au changement, 380 ms, fin exacte. Chiffres à largeur fixe (`tabular-nums`) : rien ne saute. |
| Clignotement | Aucun clignotement ; aucun effet de plus de 3 changements par seconde. |
| Lecteurs d'écran | Aucun contenu caché ou dupliqué ajouté ; notifications toujours dans `aria-live="polite"` ; `aria-busy` sur un bouton en cours. |
| Couleur | Le surlignage utilise `--accent-doux` (thème clair, sombre, contraste élevé, marque blanche). Aucun sens porté par le mouvement seul. |
| Onglet caché | Boucles en pause (`data-page-cachee`) ; compteurs non animés (valeur finale directe). |
