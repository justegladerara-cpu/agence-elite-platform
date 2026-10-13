// Bouteilles en réserve : affichage du reste en mots simples (« 1/2 bouteille », « 3 verres »).
const FRACTIONS = { 0.25: '1/4', 0.5: '1/2', 0.75: '3/4' };

const nombre = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');

export function formatReste(reste, unite = 'bouteille') {
  const q = Number(reste ?? 0);
  if (unite === 'cl') return `${nombre(q)} cl`;
  if (unite === 'verre') return `${nombre(q)} ${q > 1 ? 'verres' : 'verre'}`;
  const entier = Math.floor(q);
  const fraction = FRACTIONS[Math.round((q - entier) * 1000) / 1000];
  if (q === entier) return `${entier} ${entier > 1 ? 'bouteilles' : 'bouteille'}`;
  if (!fraction) return `${nombre(q)} bouteille`;
  return entier === 0 ? `${fraction} bouteille` : `${entier} ${entier > 1 ? 'bouteilles' : 'bouteille'} ${fraction}`;
}

// Choix rapides proposés au service, selon l'unité de la réserve.
export function portionsRapides(unite) {
  if (unite === 'bouteille') return [[0.25, '1/4'], [0.5, '1/2'], [0.75, '3/4'], [1, '1 bouteille']];
  if (unite === 'verre') return [[1, '1 verre'], [2, '2 verres'], [3, '3 verres']];
  return [[4, '4 cl'], [8, '8 cl'], [12, '12 cl']];
}

// Recherche par nom, bouteille, numéro ou téléphone (sans accents ; le numéro sans espaces).
export function filtrerReserves(reserves, texte) {
  const normal = (x) => (x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const t = normal(texte).trim();
  if (!t) return reserves;
  const chiffres = t.replace(/\D/g, '');
  return reserves.filter((r) => normal(r.nom_client).includes(t) || normal(r.libelle).includes(t) || normal(r.numero).includes(t)
    || (chiffres.length >= 3 && (r.telephone ?? '').replace(/\D/g, '').includes(chiffres)));
}
