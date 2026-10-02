// Formats d'affichage (français, FCFA sans décimales).

const SYMBOLES = { XAF: 'FCFA', XOF: 'FCFA', EUR: '€' };
const DECIMALES = { XAF: 0, XOF: 0 };

export function formatMontant(valeur, devise = 'XAF') {
  const decimales = DECIMALES[devise] ?? 2;
  const nombre = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
    .format(Number(valeur ?? 0))
    .replace(/ | /g, ' ');
  return `${nombre} ${SYMBOLES[devise] ?? devise}`;
}

export function formatQuantite(valeur, unite) {
  const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(Number(valeur ?? 0)).replace(/ | /g, ' ');
  return unite && unite !== 'unité' ? `${nombre} ${unite}` : nombre;
}

export function formatDateHeure(valeur) {
  if (!valeur) return '';
  return new Date(valeur).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(valeur) {
  if (!valeur) return '';
  const date = typeof valeur === 'string' && valeur.length === 10 ? new Date(`${valeur}T12:00:00`) : new Date(valeur);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function dateLocale(decalageJours = 0) {
  const date = new Date();
  date.setDate(date.getDate() + decalageJours);
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  const jour = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mois}-${jour}`;
}

export const MODES_PAIEMENT = {
  especes: 'Espèces',
  mobile_money: 'Mobile Money',
  carte: 'Carte',
  virement: 'Virement',
  cheque: 'Chèque',
};

export const ROLES = {
  gerant: 'Responsable d’établissement',
  responsable: 'Responsable',
  responsable_hub: 'Responsable Hub',
  gestionnaire_depot: 'Gestionnaire dépôt',
  employe: 'Caissier',
  comptable: 'Comptable',
  lecteur: 'Lecteur',
};

// Rôles plateforme (équipe Agence Elite).
export const ROLES_PLATEFORME = { super_admin: 'Super Admin', admin: 'Admin', support: 'Support' };

export const TYPES_HUB = { point_de_vente: 'Point de vente', depot: 'Dépôt', mixte: 'Point de vente + stock' };
