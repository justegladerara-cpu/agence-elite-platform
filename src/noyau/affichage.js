// Préférences d'affichage propres à l'appareil (thème, taille du texte, contraste, gros boutons).
// Elles ne donnent aucun droit et ne quittent pas l'appareil : une caisse tactile et le téléphone du gérant
// peuvent avoir des réglages différents pour le même compte.
const CLE = 'ae-affichage';

export const DEFAUT_AFFICHAGE = { theme: 'clair', texte: 'normal', contraste: 'normal', tactile: 'non' };

export const CHOIX_AFFICHAGE = {
  theme: [['clair', 'Clair'], ['sombre', 'Sombre'], ['auto', 'Comme l’appareil']],
  texte: [['normal', 'Normal'], ['grand', 'Grand'], ['tres_grand', 'Très grand']],
  contraste: [['normal', 'Normal'], ['eleve', 'Élevé']],
  tactile: [['non', 'Normaux'], ['oui', 'Gros boutons (écran tactile)']],
};

export function lireAffichage() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '{}');
    // Seules les valeurs connues sont gardées : un réglage abîmé revient au défaut.
    return Object.fromEntries(Object.entries(DEFAUT_AFFICHAGE).map(([cle, defaut]) => [
      cle, CHOIX_AFFICHAGE[cle].some(([v]) => v === brut?.[cle]) ? brut[cle] : defaut,
    ]));
  } catch {
    return { ...DEFAUT_AFFICHAGE };
  }
}

export function appliquerAffichage(preferences = lireAffichage(), racine = document.documentElement) {
  racine.dataset.theme = preferences.theme;
  racine.dataset.texte = preferences.texte;
  racine.dataset.contraste = preferences.contraste;
  racine.dataset.tactile = preferences.tactile;
  const sombre = preferences.theme === 'sombre'
    || (preferences.theme === 'auto' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sombre ? '#0B1017' : '#18202F');
}

export function enregistrerAffichage(preferences) {
  const propre = { ...lireAffichage(), ...preferences };
  try {
    localStorage.setItem(CLE, JSON.stringify(propre));
  } catch {
    // Préférence non mémorisée : elle s'applique quand même jusqu'au rechargement.
  }
  appliquerAffichage(propre);
  return propre;
}
