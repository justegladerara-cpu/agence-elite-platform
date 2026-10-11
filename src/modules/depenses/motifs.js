// « J'ai payé une dépense » : les motifs les plus courants, choisis d'un seul geste, rangés dans les catégories de
// dépenses déjà utilisées par l'application (rapports, comptabilité). La base range « Divers » par défaut.
export const MOTIFS_DEPENSE = [
  { id: 'loyer', libelle: 'Loyer', categorie: 'Loyer' },
  { id: 'transport', libelle: 'Transport', categorie: 'Transport' },
  { id: 'electricite', libelle: 'Électricité', categorie: 'Énergie' },
  { id: 'eau', libelle: 'Eau', categorie: 'Énergie' },
  { id: 'salaire', libelle: 'Salaire', categorie: 'Salaires' },
  { id: 'marchandise', libelle: 'Marchandise', categorie: 'Achats de marchandises' },
  { id: 'telephone', libelle: 'Téléphone / Internet', categorie: 'Téléphone et Internet' },
  { id: 'reparation', libelle: 'Réparation', categorie: 'Entretien' },
  { id: 'autre', libelle: 'Autre', categorie: 'Divers' },
];

export const motifParId = (id) => MOTIFS_DEPENSE.find((m) => m.id === id) ?? null;

// Libellé enregistré : ce que la personne a écrit, sinon le motif choisi (« Autre » seul → « Autre dépense »).
// '' quand rien n'est choisi ni écrit : le formulaire demande alors de choisir un motif.
export function libelleDepense({ libelle, motif }) {
  const ecrit = String(libelle ?? '').trim();
  if (ecrit) return ecrit;
  const m = motifParId(motif);
  if (!m) return '';
  return m.id === 'autre' ? 'Autre dépense' : m.libelle;
}
