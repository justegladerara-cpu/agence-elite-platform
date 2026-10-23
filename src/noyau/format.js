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

// Montant court pour un chiffre clé qui ne tient pas dans sa carte (« 125,8 M FCFA », « 12,35 Md FCFA »).
// Affichage seulement : la valeur complète reste toujours visible à côté (ChiffreCle) ; les calculs ne changent pas.
export function formatMontantCourt(valeur, devise = 'XAF') {
  const n = Number(valeur ?? 0);
  if (Math.abs(n) < 100_000) return formatMontant(n, devise);
  const nombre = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumSignificantDigits: 4 }).format(n);
  return `${nombre} ${SYMBOLES[devise] ?? devise}`;
}

// Version courte d'un montant déjà mis en forme (« 125 750 000 FCFA » → « 125,8 M FCFA ») ; null si ce n'en est pas un.
export function montantCourtDepuisTexte(texte) {
  if (typeof texte !== 'string') return null;
  const m = texte.trim().match(/^(-?[\d\s\u202f\u00a0]+(?:,\d+)?)\s(FCFA|€|[A-Z]{3})$/);
  if (!m) return null;
  const n = Number(m[1].replace(/[\s\u202f\u00a0]/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || Math.abs(n) < 100_000) return null;
  const devise = Object.entries(SYMBOLES).find(([, s]) => s === m[2])?.[0] ?? m[2];
  return formatMontantCourt(n, devise);
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
  responsable_rh: 'Responsable RH',
  gestionnaire_depot: 'Gestionnaire dépôt',
  employe: 'Caissier',
  comptable: 'Comptable',
  commercial: 'Commercial',
  collaborateur: 'Collaborateur',
  receptionniste: 'Réceptionniste',
  serveur: 'Serveur',
  serveur_tablette: 'Serveur (tablette)',
  cuisinier: 'Cuisinier',
  agent_entretien: 'Agent d’entretien',
  livreur: 'Livreur',
  secretariat: 'Secrétariat',
  lecteur: 'Lecteur',
};

// Rôles plateforme (équipe Agence Elite).
export const ROLES_PLATEFORME = { super_admin: 'Super Admin', admin: 'Admin', support: 'Support' };

export const TYPES_HUB = { point_de_vente: 'Point de vente', depot: 'Dépôt', mixte: 'Point de vente + stock' };

// Statuts d'un module, tels que les voit un client ou l'équipe (la base garde les codes techniques).
// « Disponible » = programmé, testé et documenté ; « Prévu » = déclaré au catalogue, sans écran.
export const STATUTS_MODULE = {
  actif: ['Disponible', 'vert'],
  beta: ['Bêta', 'bleu'],
  en_preparation: ['En développement', 'attention'],
  futur: ['Prévu', 'neutre'],
  retire: ['Indisponible', 'neutre'],
};

// Jour et heure dans un fuseau donné (ex. créneaux de rendez-vous dans le fuseau de l'établissement) ;
// fuseau inconnu : celui de l'appareil.
export function enFuseau(valeur, fuseau) {
  const date = new Date(valeur);
  const options = (o) => {
    try {
      return new Intl.DateTimeFormat('fr-FR', { ...o, timeZone: fuseau || undefined }).format(date);
    } catch {
      return new Intl.DateTimeFormat('fr-FR', o).format(date);
    }
  };
  return {
    cle: options({ year: 'numeric', month: '2-digit', day: '2-digit' }),
    jour: options({ weekday: 'long', day: 'numeric', month: 'long' }),
    heure: options({ hour: '2-digit', minute: '2-digit' }),
  };
}
