// Fichier de stock (CSV, séparateur ; ou ,) : une ligne par article, avec sa quantité.
// Colonnes : nom et quantite obligatoires ; categorie, reference et prix_vente facultatifs (le prix ne sert qu'à créer
// un article qui n'existe pas encore). Une ligne sans quantité est ignorée. La correspondance avec les articles existants est faite par la base.
import { decouper, normaliser } from '../articles/importCsv.js';

const COLONNES = {
  nom: ['nom', 'article', 'designation', 'libelle', 'produit'],
  quantite: ['quantite', 'qte', 'stock', 'quantite_recue', 'quantite_comptee', 'nombre'],
  categorie: ['categorie', 'famille', 'rayon'],
  reference: ['reference', 'ref', 'code'],
  prix_vente: ['prix_vente', 'prix', 'prix_de_vente'],
};

// Point-virgule (Excel en français) ; marque BOM pour que les accents s'ouvrent bien dans Excel.
export const MODELE_STOCK = '﻿nom;categorie;quantite;prix_vente;reference\n'
  + 'Riz parfumé 5 kg;Épicerie;20;5000;\n'
  + 'Huile 1 L;Épicerie;12;1500;\n'
  + 'Savon de Marseille;Hygiène;30;750;\n'
  + 'Sac cabas;;50;200;\n';

export function lireFichierStock(texte) {
  const lignes = String(texte ?? '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lignes.length < 2) throw new Error('Le fichier doit contenir une ligne d’en-tête et au moins un article.');
  const separateur = (lignes[0].match(/;/g) ?? []).length >= (lignes[0].match(/,/g) ?? []).length ? ';' : ',';
  const entetes = decouper(lignes[0], separateur).map(normaliser);
  const index = {};
  for (const [cle, alias] of Object.entries(COLONNES)) {
    const position = entetes.findIndex((e) => alias.includes(e));
    if (position >= 0) index[cle] = position;
  }
  if (index.nom === undefined || index.quantite === undefined) {
    throw new Error('Colonnes « nom » et « quantite » obligatoires : téléchargez le modèle.');
  }
  return lignes.slice(1).map((ligne) => {
    const champs = decouper(ligne, separateur);
    const article = {};
    for (const [cle, position] of Object.entries(index)) {
      const valeur = (champs[position] ?? '').trim();
      if (valeur !== '') article[cle] = cle === 'quantite' || cle === 'prix_vente' ? valeur.replace(/[\s  ]/g, '') : valeur;
    }
    return article;
  }).filter((a) => (a.nom || a.reference) && a.quantite !== undefined); // Ligne sans quantité : article non touché.
}

export function telechargerModeleStock() {
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([MODELE_STOCK], { type: 'text/csv;charset=utf-8' }));
  lien.download = 'modele-stock.csv';
  lien.click();
  URL.revokeObjectURL(lien.href);
}
