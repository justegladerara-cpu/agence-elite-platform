// Saisie rapide des articles : unités proposées, préparation d'un tableau de plusieurs articles pour
// importer_articles, calcul des nouveaux prix (changement de prix en lot). Logique pure, testée à part.

// « Vendu à » : valeur enregistrée dans articles.unite → libellé simple. « unité » est la valeur par défaut de la base.
export const UNITES = [
  ['unité', 'À l’unité (pièce)'],
  ['kg', 'Au kilo (kg)'],
  ['L', 'Au litre (L)'],
  ['m', 'Au mètre (m)'],
  ['paquet', 'Au paquet'],
  ['sachet', 'Au sachet'],
  ['boîte', 'À la boîte'],
  ['bouteille', 'À la bouteille'],
  ['verre', 'Au verre'],
  ['carton', 'Au carton'],
  ['sac', 'Au sac'],
  ['rouleau', 'Au rouleau'],
  ['paire', 'À la paire'],
  ['tas', 'Au tas'],
];

export const UNITE_AUTRE = '__autre';

export function uniteConnue(unite) {
  return UNITES.some(([valeur]) => valeur === unite);
}

// Nombre saisi à la main : « 1 500 », « 1500,5 ». Vide → null ; illisible → NaN.
export function lireNombre(texte) {
  if (texte === null || texte === undefined) return null;
  const propre = String(texte).replace(/[\s  ]/g, '').replace(',', '.');
  if (propre === '') return null;
  return /^-?\d+(\.\d+)?$/.test(propre) ? Number(propre) : Number.NaN;
}

// Comparaison des noms sans majuscules, accents ni espaces en trop.
export function cleNom(nom) {
  return String(nom ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export const ligneVide = () => ({ nom: '', prix_vente: '', cout_achat: '', unite: 'unité', categorie: '', stock_initial: '' });

// Prépare les lignes du tableau pour importer_articles (tout ou rien côté base).
// Les lignes sans nom sont ignorées ; sans prix, elles restent à compléter ; un nom déjà présent (dans vos articles ou
// plus haut dans le tableau) n'est pas recréé. Renvoie aussi, pour chaque ligne envoyée, son numéro dans le tableau.
export function preparerLignes(lignes, { nomsExistants = [], avecStock = false } = {}) {
  const deja = new Set(nomsExistants.map(cleNom));
  const vus = new Set();
  const resultat = { aEnvoyer: [], positions: [], sansPrix: [], doublons: [], invalides: [] };
  lignes.forEach((ligne, index) => {
    const nom = String(ligne.nom ?? '').trim();
    if (!nom) return;
    const cle = cleNom(nom);
    if (deja.has(cle) || vus.has(cle)) {
      resultat.doublons.push(index);
      return;
    }
    const prix = lireNombre(ligne.prix_vente);
    if (prix === null) {
      resultat.sansPrix.push(index);
      return;
    }
    const cout = lireNombre(ligne.cout_achat);
    const stock = avecStock ? lireNombre(ligne.stock_initial) : null;
    let motif = '';
    if (Number.isNaN(prix) || prix < 0) motif = 'prix de vente illisible';
    else if (Number.isNaN(cout) || (cout !== null && cout < 0)) motif = 'prix d’achat illisible';
    else if (Number.isNaN(stock) || (stock !== null && stock < 0)) motif = 'stock de départ illisible';
    if (motif) {
      resultat.invalides.push({ index, motif });
      return;
    }
    vus.add(cle);
    const article = { nom, prix_vente: prix, unite: String(ligne.unite ?? '').trim() || 'unité', suivi_stock: Boolean(stock && stock > 0) };
    if (cout !== null) article.cout_achat = cout;
    const categorie = String(ligne.categorie ?? '').trim();
    if (categorie) article.categorie = categorie;
    if (stock && stock > 0) article.stock_initial = stock;
    resultat.aEnvoyer.push(article);
    resultat.positions.push(index);
  });
  return resultat;
}

// « Ligne 3 : … » renvoyé par importer_articles → numéro de la ligne dans le tableau affiché.
export function traduireErreurImport(message, positions) {
  const texte = String(message ?? '');
  const trouve = texte.match(/Ligne (\d+) : (.*)$/s);
  if (!trouve) return texte;
  const position = positions[Number(trouve[1]) - 1];
  return position === undefined ? texte : `Ligne ${position + 1} du tableau : ${trouve[2]}`;
}

export function pluriel(n, mot) {
  return `${n} ${mot}${n > 1 ? 's' : ''}`;
}

export function messageAjout(n) {
  return n > 1 ? `${n} articles ajoutés` : `${n} article ajouté`;
}

// Arrondi au plus proche multiple de pas (5, 25 FCFA…) ; pas ≤ 1 → arrondi à l'unité.
export function arrondirPrix(valeur, pas) {
  const p = Number(pas) || 1;
  return p <= 1 ? Math.round(valeur) : Math.round(valeur / p) * p;
}

// Nouveau prix : sens « augmenter » ou « baisser », mode « pourcent » ou « montant ». null si le prix deviendrait négatif.
export function calculerPrix(prix, { sens = 'augmenter', mode = 'pourcent', valeur, pas = 5 }) {
  const ancien = Number(prix);
  const v = Number(valeur);
  if (!Number.isFinite(ancien) || !Number.isFinite(v) || v < 0) return null;
  const signe = sens === 'baisser' ? -1 : 1;
  const brut = mode === 'pourcent' ? ancien * (1 + (signe * v) / 100) : ancien + signe * v;
  const resultat = arrondirPrix(brut, pas);
  return resultat < 0 ? null : resultat;
}

// Seuls les champs lus par enregistrer_article sont renvoyés, recopiés tels quels : seul le prix change.
export function articleAvecPrix(article, prix) {
  return {
    id: article.id,
    reference: article.reference ?? null,
    code_barres: article.code_barres ?? null,
    nom: article.nom,
    description: article.description ?? null,
    categorie_id: article.categorie_id ?? null,
    prix_vente: prix,
    cout_achat: article.cout_achat ?? null,
    unite: article.unite ?? 'unité',
    suivi_stock: Boolean(article.suivi_stock),
    stock_minimum: article.stock_minimum ?? 0,
    photo: article.photo ?? null,
    actif: article.actif ?? true,
  };
}
