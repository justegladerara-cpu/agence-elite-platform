// Créations rapides proposées par le bouton « + » et la palette (Ctrl+K). Chaque action ouvre un écran existant
// déjà prêt à créer (paramètre « nouveau=1 » ou sous-page). Elle n'apparaît que si le module est actif et la
// permission accordée : la base reste seule juge à l'enregistrement.
export const ACTIONS_RAPIDES = [
  { id: 'vente', libelle: 'Nouvelle vente', mots: 'caisse ticket encaisser', route: 'caisse', module: 'caisse', permission: 'caisse.utiliser', icone: 'caisse' },
  { id: 'article', libelle: 'Nouvel article', mots: 'produit plat boisson', route: 'articles?nouveau=1', module: 'articles', permission: 'articles.gerer', icone: 'articles' },
  { id: 'contact', libelle: 'Nouveau contact', mots: 'client fournisseur prospect', route: 'contacts?nouveau=1', module: 'contacts', permission: 'contacts.gerer', icone: 'contacts' },
  { id: 'depense', libelle: 'J’ai payé une dépense', mots: 'nouvelle dépense frais sortie argent loyer transport', route: 'depenses?nouveau=1', module: 'depenses', permission: 'depenses.gerer', icone: 'depenses' },
  { id: 'devis', libelle: 'Nouveau devis', mots: 'proposition offre', route: 'factures/nouveau-devis', module: 'facturation', permission: 'facturation.gerer', icone: 'document' },
  { id: 'facture', libelle: 'Nouvelle facture', mots: 'facturer', route: 'factures/nouvelle-facture', module: 'facturation', permission: 'facturation.gerer', icone: 'facture' },
  { id: 'commande-achat', libelle: 'Nouvelle commande fournisseur', mots: 'achat bon de commande', route: 'achats/nouveau', module: 'achats', permission: 'achats.gerer', icone: 'camion' },
  { id: 'demande-achat', libelle: 'Nouvelle demande d’achat', mots: 'achat besoin', route: 'achats/nouvelle-demande', module: 'achats', permission: 'achats.demander', icone: 'camion' },
  { id: 'opportunite', libelle: 'Nouvelle opportunité', mots: 'prospect crm affaire', route: 'crm?nouveau=1', module: 'crm_pipeline', permission: 'crm_pipeline.gerer', icone: 'cible' },
  { id: 'rendez-vous', libelle: 'Nouveau rendez-vous', mots: 'agenda rdv', route: 'agenda?nouveau=1', module: 'agenda', permission: 'agenda.gerer', icone: 'calendrier' },
  { id: 'ticket', libelle: 'Nouveau ticket de support', mots: 'demande panne réclamation', route: 'support?nouveau=1', module: 'support_tickets', permission: 'support_tickets.traiter', icone: 'message' },
  { id: 'reservation-hotel', libelle: 'Nouvelle réservation (hôtel)', mots: 'chambre séjour', route: 'hotel?nouveau=1', module: 'hotel_reservations', permission: 'hotel_reservations.gerer', icone: 'lit' },
  { id: 'reservation-table', libelle: 'Nouvelle réservation de table', mots: 'restaurant salle couverts', route: 'salle?vue=reservations&nouveau=1', module: 'restaurant_salle', permission: 'restaurant_salle.servir', icone: 'table' },
  { id: 'employe', libelle: 'Nouvel employé', mots: 'rh personnel embauche', route: 'employes?nouveau=1', module: 'rh_employes', permission: 'rh_employes.gerer', icone: 'utilisateur' },
  { id: 'projet', libelle: 'Nouveau projet', mots: 'mission chantier', route: 'projets?nouveau=1', module: 'projets', permission: 'projets.gerer', icone: 'taches' },
];

export function actionsAccessibles({ moduleActif, peut }) {
  return ACTIONS_RAPIDES.filter((a) => moduleActif(a.module) && peut(a.permission));
}

// Comparaison sans accents ni majuscules : « facture » trouve « Facturé », « depense » trouve « Dépense ».
export function normaliser(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function correspond(texte, ...champs) {
  const mots = normaliser(texte).split(/\s+/).filter(Boolean);
  const cible = normaliser(champs.join(' '));
  return mots.every((m) => cible.includes(m));
}

// Pertinence d'un libellé : début du libellé > début d'un mot > contenu ailleurs (mots-clés, groupe).
export function score(texte, libelle) {
  const t = normaliser(texte);
  const l = normaliser(libelle);
  if (l === t) return 4;
  if (l.startsWith(t)) return 3;
  if (l.split(/[\s’'-]+/).some((mot) => mot.startsWith(t))) return 2;
  return l.includes(t) ? 1 : 0;
}

export const LIBELLES_RESULTATS = {
  article: 'Article',
  contact: 'Contact',
  vente: 'Vente',
  facture: 'Facture',
  devis: 'Devis',
  avoir: 'Avoir',
  reservation: 'Réservation',
  chambre: 'Chambre',
  table: 'Table',
  employe: 'Employé',
  ticket: 'Ticket',
  opportunite: 'Opportunité',
  projet: 'Projet',
  commande_achat: 'Commande fournisseur',
  rendez_vous: 'Rendez-vous',
};
