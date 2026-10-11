// Caisse : vente au poids (ou au volume, à la longueur) et articles favoris. Fonctions pures, testées.

// Unités qui se vendent « au poids » : la quantité n'est pas un nombre entier de pièces.
const UNITES_POIDS = new Set([
  'kg', 'kgs', 'kilo', 'kilos', 'kilogramme', 'kilogrammes',
  'g', 'gr', 'grs', 'gramme', 'grammes',
  'l', 'lt', 'litre', 'litres', 'cl', 'centilitre', 'centilitres', 'ml', 'millilitre', 'millilitres',
  'm', 'metre', 'metres', 'cm', 'centimetre', 'centimetres',
]);

function normaliserUnite(unite) {
  return String(unite ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\.$/, '');
}

export function estVenteAuPoids(unite) {
  return UNITES_POIDS.has(normaliserUnite(unite));
}

// Arrondi à 3 décimales (le gramme pour un article au kilo), sans bruit de virgule flottante.
export function arrondirQuantite(valeur) {
  return Math.round(Number(valeur || 0) * 1000) / 1000;
}

// Gros boutons de la fenêtre « Combien ? », dans cet ordre.
export const FRACTIONS = [
  { valeur: 1, libelle: '1' },
  { valeur: 0.5, libelle: '½' },
  { valeur: 0.25, libelle: '¼' },
  { valeur: 0.75, libelle: '¾' },
  { valeur: 2, libelle: '2' },
];

// « Pour un montant » : le client veut 500 F de poulet → quantité = montant / prix, arrondie à 3 décimales.
export function quantitePourMontant(montant, prix) {
  const m = Number(montant);
  const p = Number(prix);
  if (!(m > 0) || !(p > 0)) return 0;
  return arrondirQuantite(m / p);
}

// ── Favoris : quantités vendues par article, gardées sur cet appareil (une liste par établissement). ──
export const MAX_FAVORIS = 12;
export const MIN_FAVORIS_AUTO = 4;

export function cleFavoris(etablissementId) {
  return `ae-caisse-favoris-${etablissementId}`;
}

// compteurs : { article_id: quantité vendue } ; articlesActifs : ids encore vendables.
// Les plus vendus d'abord ; à égalité, l'ordre de la liste des articles.
export function classerFavoris(compteurs, articlesActifs, max = MAX_FAVORIS) {
  const ordre = new Map(articlesActifs.map((id, i) => [id, i]));
  return Object.entries(compteurs ?? {})
    .filter(([id, n]) => ordre.has(id) && Number(n) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]) || ordre.get(a[0]) - ordre.get(b[0]))
    .slice(0, max)
    .map(([id]) => id);
}

// Ajoute (sens = 1) ou retire (sens = -1, vente annulée) les quantités d'une vente.
export function compterVente(compteurs, lignes, sens = 1) {
  const suivant = { ...(compteurs ?? {}) };
  for (const l of lignes ?? []) {
    const n = arrondirQuantite((Number(suivant[l.article_id]) || 0) + sens * Number(l.quantite || 0));
    if (n > 0) suivant[l.article_id] = n;
    else delete suivant[l.article_id];
  }
  return suivant;
}

// Lecture / écriture protégées : navigation privée ou stockage bloqué = pas de favoris, jamais d'erreur.
export function lireFavoris(etablissementId) {
  try {
    const brut = JSON.parse(localStorage.getItem(cleFavoris(etablissementId)) ?? '{}');
    return brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  } catch {
    return {};
  }
}

export function enregistrerFavoris(etablissementId, compteurs) {
  try {
    localStorage.setItem(cleFavoris(etablissementId), JSON.stringify(compteurs));
  } catch {
    // Stockage indisponible : les favoris ne sont simplement pas retenus.
  }
}
