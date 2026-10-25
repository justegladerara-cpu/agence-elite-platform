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

// Polices au choix (Paramètres > Apparence) : titres, textes, chiffres. Toutes viennent de Google Fonts ; « Système »
// garde la police de l'appareil (rien à télécharger, le plus rapide sur une connexion lente).
export const POLICES = {
  titre: ['Playfair Display', 'Cormorant Garamond', 'DM Serif Display', 'Cinzel', 'Lora', 'Montserrat', 'Poppins', 'Oswald', 'Bebas Neue', 'Inter'],
  texte: ['Inter', 'Poppins', 'Montserrat', 'Nunito', 'Lato', 'Open Sans', 'Roboto', 'Source Sans 3', 'DM Sans', 'Système'],
  chiffres: ['Inter', 'Poppins', 'Montserrat', 'Roboto', 'Space Grotesk', 'Oswald', 'Roboto Mono', 'JetBrains Mono', 'Playfair Display', 'Système'],
};
export const POLICES_DEFAUT = { titre: 'Playfair Display', texte: 'Inter', chiffres: 'Inter' };
export const TAILLES_TEXTE = { normal: 1, grand: 1.12, 'tres-grand': 1.25 };
const TAILLES_BASE = { '--texte-xs': 12, '--texte-sm': 13, '--texte-base': 14, '--texte-md': 15, '--texte-lg': 17, '--texte-xl': 20 };
const SECOURS = { titre: 'Georgia, serif', texte: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", chiffres: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" };
const SERIF = new Set(['Playfair Display', 'Cormorant Garamond', 'DM Serif Display', 'Cinzel', 'Lora']);

// Un nom de police tapé à la main : lettres, chiffres et espaces seulement (rien d'autre n'entre dans le lien).
export function nomPoliceValide(nom) {
  return typeof nom === 'string' && /^[A-Za-zÀ-ÿ0-9 ]{2,40}$/.test(nom.trim());
}

export function policesDe(apparence) {
  const choix = apparence?.polices ?? {};
  const res = {};
  for (const cle of Object.keys(POLICES_DEFAUT)) res[cle] = nomPoliceValide(choix[cle]) ? choix[cle].trim() : POLICES_DEFAUT[cle];
  return res;
}

export function pilePolice(nom, role) {
  if (nom === 'Système') return SECOURS[role];
  const secours = SERIF.has(nom) ? 'Georgia, serif' : SECOURS[role];
  return `'${nom}', ${secours}`;
}

// Lien Google Fonts d'une police. Avec les graisses 400 à 700 ; « simple » = sans graisse (pour une police qui n'a
// qu'une graisse, comme Bebas Neue : Google refuse sinon le lien entier).
export function lienPolice(nom, simple = false) {
  if (!nom || nom === 'Système') return null;
  const famille = nom.trim().replace(/ /g, '+');
  return `https://fonts.googleapis.com/css2?family=${famille}${simple ? '' : ':wght@400;500;600;700'}&display=swap`;
}

const CLES = [...new Set([...Object.keys(PALETTES.nuit), ...Object.keys(PALETTES.jour), '--degrade-marque', '--police-titre', '--police', '--police-chiffres', ...Object.keys(TAILLES_BASE)])];

// Réglages lus dans Paramètres > Apparence (module etablissement, clé apparence).
export function ambianceDe(reglages) {
  const etab = reglages?.etablissement ?? {};
  if (etab.nouvelle_version !== true) return null;
  const apparence = etab.apparence ?? {};
  if ((apparence.theme ?? 'dream') !== 'dream') return null;
  const mode = ['nuit', 'jour', 'auto'].includes(apparence.mode) ? apparence.mode : 'nuit';
  const taille = Object.hasOwn(TAILLES_TEXTE, apparence.taille_texte) ? apparence.taille_texte : 'normal';
  return { theme: 'dream', mode, animations: apparence.animations !== false, polices: policesDe(apparence), taille };
}

function modeEffectif(mode) {
  if (mode !== 'auto') return mode;
  // « Auto » : la nuit dès 18 h (le bar ouvre le soir), le jour le matin.
  const h = new Date().getHours();
  return h >= 18 || h < 7 ? 'nuit' : 'jour';
}

// Un lien par police choisie (seules celles-là sont téléchargées) ; les liens des polices quittées sont retirés.
export function chargerPolices(noms) {
  if (typeof document === 'undefined') return;
  const voulus = [...new Set(noms.filter((n) => n && n !== 'Système'))];
  const presents = [...document.querySelectorAll('link[data-police-dream]')];
  presents.forEach((l) => { if (!voulus.includes(l.dataset.policeDream)) l.remove(); });
  voulus.forEach((nom) => {
    if (presents.some((l) => l.dataset.policeDream === nom && l.isConnected)) return;
    const lien = document.createElement('link');
    lien.rel = 'stylesheet';
    lien.dataset.policeDream = nom;
    lien.href = lienPolice(nom);
    lien.addEventListener('error', () => { if (!lien.dataset.simple) { lien.dataset.simple = '1'; lien.href = lienPolice(nom, true); } });
    document.head.appendChild(lien);
  });
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
  const polices = ambiance.polices ?? POLICES_DEFAUT;
  racine.style.setProperty('--police-titre', pilePolice(polices.titre, 'titre'));
  racine.style.setProperty('--police', pilePolice(polices.texte, 'texte'));
  racine.style.setProperty('--police-chiffres', pilePolice(polices.chiffres, 'chiffres'));
  const facteur = TAILLES_TEXTE[ambiance.taille] ?? 1;
  Object.entries(TAILLES_BASE).forEach(([cle, px]) => {
    if (facteur === 1) racine.style.removeProperty(cle);
    else racine.style.setProperty(cle, `${Math.round(px * facteur)}px`);
  });
  racine.dataset.ambiance = 'dream';
  racine.dataset.dream = mode;
  if (typeof document !== 'undefined') {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'nuit' ? '#0B0B0D' : '#FAF7F0');
    chargerPolices(Object.values(polices));
  }
}
