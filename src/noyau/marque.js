// Identité affichée (white-label contrôlé). La base fournit l'identité effective
// (établissement → client → plateforme) ; l'écran ne fait que l'appliquer.
// Seules des couleurs de la palette sont acceptées par la base : aucune CSS libre.

export const MARQUE_DEFAUT = {
  nom_logiciel: 'Agence Elite',
  nom_court: 'AE',
  sous_titre: 'Logiciels de gestion',
  logo_url: null,
  favicon_url: null,
  couleur_accent: '#2563eb',
};

// Même palette que public.couleurs_marque() (lisible avec du texte blanc).
export const COULEURS_MARQUE = [
  ['#2563eb', 'Bleu'], ['#1d4ed8', 'Bleu foncé'], ['#4338ca', 'Indigo'], ['#7c3aed', 'Violet'], ['#a21caf', 'Fuchsia'],
  ['#be123c', 'Framboise'], ['#b91c1c', 'Rouge'], ['#c2410c', 'Orange'], ['#b45309', 'Ambre'], ['#4d7c0f', 'Olive'],
  ['#15803d', 'Vert'], ['#0f766e', 'Sarcelle'], ['#0e7490', 'Cyan'], ['#334155', 'Ardoise'], ['#18202f', 'Nuit'],
];

function versRvb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function versHex(rvb) {
  return `#${rvb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

// Mélange une couleur avec une autre (0 = couleur d'origine, 1 = l'autre).
export function melanger(hex, autre, ratio) {
  const a = versRvb(hex);
  const b = versRvb(autre);
  return versHex(a.map((c, i) => c + (b[i] - c) * ratio));
}

export function marqueValide(marque) {
  const m = { ...MARQUE_DEFAUT, ...Object.fromEntries(Object.entries(marque ?? {}).filter(([, v]) => v != null && v !== '')) };
  if (!/^#[0-9a-f]{6}$/i.test(m.couleur_accent)) m.couleur_accent = MARQUE_DEFAUT.couleur_accent;
  return m;
}

// Applique l'identité : couleur d'accent (3 nuances), titre de l'onglet, icône.
export function appliquerMarque(marque, titrePage) {
  if (typeof document === 'undefined') return;
  const m = marqueValide(marque);
  const racine = document.documentElement.style;
  racine.setProperty('--accent', m.couleur_accent);
  racine.setProperty('--accent-fort', melanger(m.couleur_accent, '#000000', 0.18));
  racine.setProperty('--accent-doux', melanger(m.couleur_accent, '#ffffff', 0.9));
  racine.setProperty('--bleu-doux', melanger(m.couleur_accent, '#ffffff', 0.9));
  document.title = titrePage ? `${titrePage} · ${m.nom_logiciel}` : m.nom_logiciel;
  let lien = document.querySelector('link[rel="icon"]');
  if (m.favicon_url || m.logo_url) {
    if (!lien) {
      lien = document.createElement('link');
      lien.rel = 'icon';
      document.head.appendChild(lien);
    }
    if (!lien.dataset.origine) lien.dataset.origine = lien.getAttribute('href') ?? '';
    lien.href = m.favicon_url ?? m.logo_url;
  } else if (lien?.dataset.origine) {
    lien.href = lien.dataset.origine;
  }
}
