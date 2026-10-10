import { formatQuantite } from '../../noyau/format.js';

// Quantité d'un article sur un Hub (ou la somme sur les Hubs visibles), à partir de useStockHubs.
export function quantiteHub(donnees, articleId, hubId, hubsVisibles) {
  const parHub = donnees?.parArticle[articleId] ?? {};
  if (hubId) return parHub[hubId] ?? 0;
  return hubsVisibles.reduce((s, h) => s + (parHub[h.id] ?? 0), 0);
}

// Nom du casier d'un article (casier, carton, pack…), au pluriel si besoin.
export function nomCasier(article, nombre = 2) {
  const nom = article.nom_lot || 'casier';
  return nombre > 1 && !/[sx]$/i.test(nom) ? `${nom}s` : nom;
}

// Quantité affichée en casiers + unités pour un article vendu à l'unité et stocké en casiers : « 5 casiers + 3 ».
export function formatEnCasiers(valeur, article) {
  const parLot = Number(article?.unites_par_lot) || 0;
  const n = Number(valeur ?? 0);
  if (!parLot || n < parLot || !Number.isInteger(n)) return formatQuantite(n, article?.unite);
  const lots = Math.floor(n / parLot);
  const reste = n - lots * parLot;
  return `${lots} ${nomCasier(article, lots)}${reste ? ` + ${formatQuantite(reste, article.unite)}` : ''}`;
}
