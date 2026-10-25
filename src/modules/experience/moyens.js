// Moyens d'encaissement réglables (Paramètres › Encaissement, nouvelle version de The Dream).
// La base ne connaît que 5 modes (especes, mobile_money, carte, virement, cheque) : l'opérateur (MTN, Airtel, TPE…)
// est écrit au début de la référence du paiement, « MTN · 4821 · 06 123 45 67 ». Le centre de commande relit ce début.

export const MODES_BASE = {
  especes: 'Espèces',
  mobile_money: 'Mobile money',
  carte: 'Carte bancaire',
  virement: 'Virement',
  cheque: 'Chèque',
};

export const MOYENS_DEFAUT = [
  { id: 'mtn', libelle: 'MTN Mobile Money', mode: 'mobile_money', actif: true, reference: 'obligatoire', couleur: '#FFCB05' },
  { id: 'airtel', libelle: 'Airtel Money', mode: 'mobile_money', actif: true, reference: 'obligatoire', couleur: '#E4002B' },
  { id: 'especes', libelle: 'Espèces', mode: 'especes', actif: true, reference: 'non', couleur: '#2FBF71' },
  { id: 'tpe', libelle: 'Carte (TPE)', mode: 'carte', actif: true, reference: 'facultative', couleur: '#8AA4FF' },
  { id: 'virement', libelle: 'Virement', mode: 'virement', actif: false, reference: 'facultative', couleur: '#A39E93' },
  { id: 'cheque', libelle: 'Chèque', mode: 'cheque', actif: false, reference: 'facultative', couleur: '#A39E93' },
];

const COULEURS_LIBRES = ['#D4AF37', '#2FBF71', '#F2A93B', '#8AA4FF', '#E5484D', '#C9A0FF'];

// Billets du Congo (FCFA), du plus petit au plus grand.
export const BILLETS_FCFA = [500, 1000, 2000, 5000, 10000];

export function identifiantMoyen(libelle) {
  return String(libelle ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 24) || 'moyen';
}

// Liste complète et propre : un réglage abîmé ou absent revient aux moyens par défaut.
export function lireMoyens(reglages) {
  const brut = reglages?.caisse?.moyens_encaissement;
  if (!Array.isArray(brut) || !brut.length) return MOYENS_DEFAUT.map((m) => ({ ...m }));
  const vus = new Set();
  const liste = [];
  brut.forEach((m, i) => {
    if (!m || typeof m !== 'object') return;
    const mode = MODES_BASE[m.mode] ? m.mode : 'mobile_money';
    let id = identifiantMoyen(m.id || m.libelle);
    while (vus.has(id)) id = `${id}-2`;
    vus.add(id);
    const defaut = MOYENS_DEFAUT.find((d) => d.id === id);
    liste.push({
      id,
      libelle: String(m.libelle || defaut?.libelle || MODES_BASE[mode]).slice(0, 40),
      mode,
      actif: m.actif !== false,
      reference: ['obligatoire', 'facultative', 'non'].includes(m.reference) ? m.reference : (mode === 'especes' ? 'non' : 'facultative'),
      couleur: /^#[0-9a-f]{6}$/i.test(m.couleur ?? '') ? m.couleur : defaut?.couleur ?? COULEURS_LIBRES[i % COULEURS_LIBRES.length],
    });
  });
  return liste.length ? liste : MOYENS_DEFAUT.map((m) => ({ ...m }));
}

export const moyensActifs = (reglages) => lireMoyens(reglages).filter((m) => m.actif);

// Début de la référence : MTN, AIRTEL, TPE… (les espèces n'en ont pas besoin).
export const prefixeMoyen = (moyen) => moyen.id.toUpperCase();

const propre = (texte) => String(texte ?? '').replace(/·/g, '').trim();

export function referencePaiement(moyen, { chiffres = '', numero = '' } = {}) {
  if (moyen.mode === 'especes') return '';
  return [prefixeMoyen(moyen), propre(chiffres), propre(numero)].filter(Boolean).join(' · ').slice(0, 120);
}

// Retrouve le moyen d'un paiement enregistré (centre de commande, tickets).
export function moyenDuPaiement(paiement, moyens = MOYENS_DEFAUT) {
  const prefixe = String(paiement?.reference ?? '').split('·')[0].trim().toUpperCase();
  const trouve = prefixe && moyens.find((m) => prefixeMoyen(m) === prefixe);
  if (trouve) return trouve;
  const parMode = moyens.find((m) => m.mode === paiement?.mode && (paiement.mode !== 'mobile_money' || !prefixe));
  return parMode ?? { id: paiement?.mode ?? 'autre', libelle: MODES_BASE[paiement?.mode] ?? 'Autre', mode: paiement?.mode, couleur: '#A39E93' };
}

// Libellé lisible d'un moyen vu dans pilotage_bar (« MTN », « especes »…).
export function libelleMoyen(cle, moyens = MOYENS_DEFAUT) {
  const m = moyens.find((x) => prefixeMoyen(x) === String(cle).toUpperCase() || x.id === cle);
  return m?.libelle ?? MODES_BASE[cle] ?? cle;
}

export function couleurMoyen(cle, moyens = MOYENS_DEFAUT) {
  const m = moyens.find((x) => prefixeMoyen(x) === String(cle).toUpperCase() || x.id === cle);
  return m?.couleur ?? (cle === 'especes' ? '#2FBF71' : '#A39E93');
}

// Contrôle d'une ligne avant l'envoi. Rend un message clair, ou '' si tout va bien.
export function erreurLigne(ligne, moyen) {
  const montant = Number(ligne.montant);
  if (!(montant > 0)) return `Montant ${moyen.libelle} manquant`;
  if (moyen.reference === 'obligatoire') {
    const chiffres = String(ligne.chiffres ?? '').replace(/\s/g, '');
    if (chiffres.length < 4) return `${moyen.libelle} : tapez au moins les 4 derniers chiffres de la référence`;
  }
  return '';
}

// Paiements envoyés à la base : un par ligne, l'opérateur dans la référence.
export function paiementsPourVente(lignes, moyens) {
  return lignes
    .filter((l) => Number(l.montant) > 0)
    .map((l) => {
      const moyen = moyens.find((m) => m.id === l.moyen) ?? MOYENS_DEFAUT[2];
      return { mode: moyen.mode, montant: Number(l.montant), reference: referencePaiement(moyen, l) };
    });
}

// Billet touché : on ajoute au montant reçu, sauf si le client avait déjà donné assez (on recommence avec ce billet).
export function ajouterBillet(recu, billet, total) {
  const actuel = Number(recu || 0);
  return actuel >= total ? billet : actuel + billet;
}

// Billets qui suffisent à payer seuls : proposés en premier (« le client donne 5 000 »).
export function billetsSuggeres(total, billets = BILLETS_FCFA) {
  const proposes = new Set();
  for (const b of billets) {
    if (b >= total) proposes.add(b);
    const arrondi = Math.ceil(total / b) * b;
    if (arrondi > total && arrondi <= total + 10000) proposes.add(arrondi);
  }
  return [...proposes].sort((a, b) => a - b).slice(0, 4);
}
