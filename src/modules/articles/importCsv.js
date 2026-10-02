// Lecture d'un fichier tableur (CSV, séparateur ; ou ,) en lignes d'articles.

const COLONNES = {
  nom: ['nom', 'article', 'designation', 'libelle'],
  prix_vente: ['prix_vente', 'prix', 'prix_de_vente'],
  cout_achat: ['cout_achat', 'cout', 'prix_achat', 'prix_d_achat'],
  categorie: ['categorie', 'famille', 'rayon'],
  reference: ['reference', 'ref', 'code'],
  code_barres: ['code_barres', 'codebarre', 'ean'],
  unite: ['unite'],
  stock_initial: ['stock_initial', 'stock', 'quantite'],
  stock_minimum: ['stock_minimum', 'alerte', 'seuil'],
};
const NUMERIQUES = ['prix_vente', 'cout_achat', 'stock_initial', 'stock_minimum'];

export const MODELE_CSV = 'nom;prix_vente;cout_achat;categorie;reference;code_barres;unite;stock_initial;stock_minimum\n'
  + 'Gants de protection;3500;2000;EPI;EPI-001;;unité;40;10\n'
  + 'Câble électrique;800;450;Consommables;CON-003;;m;200;50\n';

function normaliser(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function decouper(ligne, separateur) {
  const champs = [];
  let courant = '';
  let guillemets = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i];
    if (c === '"') {
      if (guillemets && ligne[i + 1] === '"') {
        courant += '"';
        i += 1;
      } else guillemets = !guillemets;
    } else if (c === separateur && !guillemets) {
      champs.push(courant);
      courant = '';
    } else courant += c;
  }
  champs.push(courant);
  return champs.map((x) => x.trim());
}

function nombre(texte) {
  const propre = String(texte).replace(/[\s  ]/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  return propre === '' ? null : Number(propre);
}

export function lireCsvArticles(texte) {
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lignes.length < 2) throw new Error('Le fichier doit contenir une ligne d’en-tête et au moins un article.');
  const separateur = (lignes[0].match(/;/g) ?? []).length >= (lignes[0].match(/,/g) ?? []).length ? ';' : ',';
  const entetes = decouper(lignes[0], separateur).map(normaliser);
  const index = {};
  for (const [cle, alias] of Object.entries(COLONNES)) {
    const position = entetes.findIndex((e) => alias.includes(e));
    if (position >= 0) index[cle] = position;
  }
  if (index.nom === undefined || index.prix_vente === undefined) {
    throw new Error('Colonnes « nom » et « prix_vente » obligatoires (voir le modèle).');
  }
  return lignes.slice(1).map((ligne) => {
    const champs = decouper(ligne, separateur);
    const article = {};
    for (const [cle, position] of Object.entries(index)) {
      const valeur = champs[position] ?? '';
      if (valeur === '') continue;
      article[cle] = NUMERIQUES.includes(cle) ? nombre(valeur) : valeur;
    }
    return article;
  });
}
