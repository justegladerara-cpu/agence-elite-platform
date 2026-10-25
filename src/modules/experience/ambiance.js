// Ambiance « The Dream » : noir et or, tirée du logo (nouvelle version, 2026-10-25).
// Les jetons sont posés directement sur <html> (comme la couleur de marque), donc ils passent avant le thème
// clair ou sombre de l'appareil. Quitter l'ambiance retire tout : les autres établissements ne voient rien.

export const PALETTES = {
  nuit: {
    '--fond': '#0B0B0D',
    '--surface': '#16161A',
    '--surface-douce': '#1B1B20',
    '--surface-survol': '#212127',
    '--bordure': '#2A261B',
    '--bordure-forte': '#3D3522',
    '--bordure-champ': '#6E6143',
    '--texte': '#F5F1E6',
    '--texte-doux': '#C4BDAE',
    '--texte-faible': '#A39E93',
    '--accent': '#D4AF37',
    '--accent-fort': '#B8912A',
    '--accent-doux': '#2A2414',
    '--bleu-doux': '#2A2414',
    '--accent-2': '#F3D98B',
    '--accent-3': '#9C7A2B',
    '--vert': '#2FBF71',
    '--vert-doux': '#10291C',
    '--orange': '#F2A93B',
    '--orange-doux': '#33260F',
    '--rouge': '#E5484D',
    '--rouge-doux': '#3A1618',
    '--menu': '#0B0B0D',
    '--menu-texte': '#C4BDAE',
    '--menu-titre': '#8C8577',
    '--menu-survol': '#18171A',
    '--menu-actif': '#2A2414',
    '--menu-bordure': '#1F1C15',
    '--menu-fort': '#F5F1E6',
    '--menu-fort-actif': '#F3D98B',
    '--sur-or': '#0B0B0D',
    '--anneau': 'rgba(212, 175, 55, 0.16)',
    '--anneau-fort': 'rgba(212, 175, 55, 0.30)',
    '--ombre': '0 1px 2px rgba(0, 0, 0, 0.5)',
    '--ombre-carte': '0 0 0 1px rgba(212, 175, 55, 0.14), 0 8px 24px -10px rgba(0, 0, 0, 0.7)',
    '--ombre-survol': '0 0 0 1px rgba(212, 175, 55, 0.35), 0 18px 36px -14px rgba(0, 0, 0, 0.8)',
    '--ombre-bouton': '0 0 0 1px rgba(212, 175, 55, 0.22), 0 2px 6px -2px rgba(0, 0, 0, 0.6)',
    '--ombre-forte': '0 18px 40px rgba(0, 0, 0, 0.7)',
  },
  jour: {
    '--fond': '#FAF7F0',
    '--surface': '#FFFFFF',
    '--surface-douce': '#FBF8F1',
    '--surface-survol': '#F5EFE2',
    '--bordure': '#EDE4CF',
    '--bordure-forte': '#DCCDA8',
    '--bordure-champ': '#8E7A4A',
    '--texte': '#1A1712',
    '--texte-doux': '#5C5446',
    '--texte-faible': '#6F6656',
    '--accent': '#B8912A',
    '--accent-fort': '#8F6F1E',
    '--accent-doux': '#F6EDD4',
    '--bleu-doux': '#F6EDD4',
    '--accent-2': '#D4AF37',
    '--accent-3': '#9C7A2B',
    '--vert': '#1F8A52',
    '--vert-doux': '#E3F4EA',
    '--orange': '#B86E0B',
    '--orange-doux': '#FCF0DC',
    '--rouge': '#C42F34',
    '--rouge-doux': '#FBE6E6',
    '--menu': '#FFFFFF',
    '--menu-texte': '#5C5446',
    '--menu-titre': '#8E846F',
    '--menu-survol': '#F7F1E4',
    '--menu-actif': '#F6EDD4',
    '--menu-bordure': '#EDE4CF',
    '--menu-fort': '#1A1712',
    '--menu-fort-actif': '#8F6F1E',
    '--sur-or': '#1A1712',
    '--anneau': 'rgba(156, 122, 43, 0.16)',
    '--anneau-fort': 'rgba(156, 122, 43, 0.30)',
    '--ombre': '0 1px 2px rgba(60, 45, 10, 0.06)',
    '--ombre-carte': '0 0 0 1px rgba(156, 122, 43, 0.14), 0 8px 22px -10px rgba(60, 45, 10, 0.18)',
    '--ombre-survol': '0 0 0 1px rgba(156, 122, 43, 0.32), 0 18px 34px -14px rgba(60, 45, 10, 0.28)',
    '--ombre-bouton': '0 0 0 1px rgba(156, 122, 43, 0.24), 0 2px 5px -2px rgba(60, 45, 10, 0.18)',
    '--ombre-forte': '0 18px 40px rgba(60, 45, 10, 0.22)',
  },
};

// Dégradé or : champagne → or → bronze, avec le même nom que le dégradé de marque du reste du logiciel.
const DEGRADE = 'linear-gradient(135deg, #F3D98B 0%, #D4AF37 48%, #9C7A2B 100%)';

const CLES = [...new Set([...Object.keys(PALETTES.nuit), ...Object.keys(PALETTES.jour), '--degrade-marque', '--police-titre'])];

// Réglages lus dans Paramètres > Apparence (module etablissement, clé apparence).
export function ambianceDe(reglages) {
  const etab = reglages?.etablissement ?? {};
  if (etab.nouvelle_version !== true) return null;
  const apparence = etab.apparence ?? {};
  if ((apparence.theme ?? 'dream') !== 'dream') return null;
  const mode = ['nuit', 'jour', 'auto'].includes(apparence.mode) ? apparence.mode : 'nuit';
  return { theme: 'dream', mode, animations: apparence.animations !== false };
}

function modeEffectif(mode) {
  if (mode !== 'auto') return mode;
  // « Auto » : la nuit dès 18 h (le bar ouvre le soir), le jour le matin.
  const h = new Date().getHours();
  return h >= 18 || h < 7 ? 'nuit' : 'jour';
}

let policeChargee = false;
function chargerPolices() {
  if (policeChargee || typeof document === 'undefined') return;
  policeChargee = true;
  // Une seule police de titre, chargée seulement pour cette ambiance (connexion lente : rien de plus).
  const lien = document.createElement('link');
  lien.rel = 'stylesheet';
  lien.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap';
  document.head.appendChild(lien);
}

export function appliquerAmbiance(ambiance, racine = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!racine) return;
  if (!ambiance) {
    if (racine.dataset.ambiance) {
      CLES.forEach((cle) => racine.style.removeProperty(cle));
      delete racine.dataset.ambiance;
      delete racine.dataset.dream;
    }
    return;
  }
  const mode = modeEffectif(ambiance.mode);
  const palette = PALETTES[mode];
  Object.entries(palette).forEach(([cle, valeur]) => racine.style.setProperty(cle, valeur));
  racine.style.setProperty('--degrade-marque', DEGRADE);
  racine.style.setProperty('--police-titre', "'Playfair Display', 'Cormorant Garamond', Georgia, serif");
  racine.dataset.ambiance = 'dream';
  racine.dataset.dream = mode;
  if (typeof document !== 'undefined') {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'nuit' ? '#0B0B0D' : '#FAF7F0');
    chargerPolices();
  }
}
