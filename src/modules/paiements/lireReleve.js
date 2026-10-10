// Lecture d'un relevé de banque ou de Mobile Money exporté en tableur (CSV, séparateur ; , ou tabulation).
// Colonnes reconnues : date, libellé, référence, et soit un montant signé, soit des colonnes débit / crédit.
// Rien ne part au serveur tant que l'aperçu n'est pas validé.

const COLONNES = {
  jour: ['date', 'date_operation', 'date_op', 'jour', 'date_valeur', 'transaction_date'],
  libelle: ['libelle', 'description', 'designation', 'operation', 'motif', 'details', 'narration', 'label'],
  reference: ['reference', 'ref', 'transaction', 'id_transaction', 'numero', 'transaction_id', 'id'],
  montant: ['montant', 'amount', 'valeur', 'somme'],
  credit: ['credit', 'entree', 'recu', 'encaissement', 'credit_montant'],
  debit: ['debit', 'sortie', 'envoye', 'decaissement', 'debit_montant'],
};

export const MODELE_RELEVE = 'date;libelle;reference;montant\n'
  + '2026-10-02;Virement reçu client;VIR-1234;150000\n'
  + '2026-10-03;Frais de tenue de compte;;-2500\n';

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

// « 1 234,50 », « 1,234.50 », « -2500 », « (2500) » : le dernier séparateur suivi de 1 ou 2 chiffres est la virgule décimale.
export function lireMontant(texte) {
  let t = String(texte ?? '').replace(/[\s  ]/g, '');
  if (t === '') return null;
  let signe = 1;
  if (/^\(.*\)$/.test(t)) {
    signe = -1;
    t = t.slice(1, -1);
  }
  if (t.startsWith('-')) {
    signe = -signe;
    t = t.slice(1);
  } else if (t.endsWith('-')) {
    signe = -signe;
    t = t.slice(0, -1);
  }
  t = t.replace(/^\+/, '').replace(/[^0-9.,]/g, '');
  const decimal = t.match(/[.,](\d{1,2})$/);
  const entier = decimal ? t.slice(0, -decimal[0].length) : t;
  const propre = `${entier.replace(/[.,]/g, '')}${decimal ? `.${decimal[1]}` : ''}`;
  if (!/^\d+(\.\d+)?$/.test(propre)) return null;
  return signe * Number(propre);
}

// AAAA-MM-JJ toujours ; sinon JJ/MM/AAAA ou MM/JJ/AAAA selon l'ordre choisi (séparateurs / . -).
export function lireDate(texte, ordre = 'jma') {
  const t = String(texte ?? '').trim().slice(0, 10);
  let a;
  let m;
  let j;
  let x = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (x) [, a, m, j] = x;
  else {
    x = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (!x) return null;
    [, j, m, a] = x;
    if (ordre === 'mja') [j, m] = [m, j];
    if (a.length === 2) a = `20${a}`;
  }
  const iso = `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

export function lireReleve(texte, ordre = 'jma') {
  const lignes = String(texte ?? '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lignes.length < 2) throw new Error('Le fichier doit contenir une ligne d’en-tête et au moins une opération.');
  const compte = (c) => (lignes[0].split(c).length - 1);
  const separateur = [';', '\t', ','].reduce((meilleur, c) => (compte(c) > compte(meilleur) ? c : meilleur), ';');
  const entetes = decouper(lignes[0], separateur).map(normaliser);
  const index = {};
  for (const [cle, alias] of Object.entries(COLONNES)) {
    const position = entetes.findIndex((e) => alias.includes(e));
    if (position >= 0) index[cle] = position;
  }
  if (index.jour === undefined || (index.montant === undefined && index.credit === undefined && index.debit === undefined)) {
    throw new Error('Colonnes « date » et « montant » (ou « débit » / « crédit ») obligatoires : voir le modèle.');
  }
  const operations = [];
  const erreurs = [];
  lignes.slice(1).forEach((ligne, i) => {
    const champs = decouper(ligne, separateur);
    const valeur = (cle) => (index[cle] === undefined ? '' : champs[index[cle]] ?? '');
    const jour = lireDate(valeur('jour'), ordre);
    let montant = index.montant !== undefined ? lireMontant(valeur('montant')) : null;
    if (montant === null) {
      const credit = lireMontant(valeur('credit'));
      const debit = lireMontant(valeur('debit'));
      if (credit || debit) montant = Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (!jour || montant === null || Number.isNaN(montant) || montant === 0) {
      erreurs.push({ ligne: i + 2, texte: ligne.slice(0, 120), raison: !jour ? 'date illisible' : 'montant absent ou nul' });
      return;
    }
    operations.push({
      jour,
      libelle: valeur('libelle').slice(0, 300),
      reference: valeur('reference').slice(0, 120) || null,
      montant: Math.round(montant * 100) / 100,
    });
  });
  return { operations, erreurs };
}
