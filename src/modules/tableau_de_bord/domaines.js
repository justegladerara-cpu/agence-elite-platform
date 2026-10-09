// Tableaux de bord par domaine : présentation et actions rapides.
// La base décide quels domaines l'utilisateur voit (cockpit_domaines : module actif + permission) ;
// ce catalogue n'ajoute que l'icône et les raccourcis, chacun filtré par sa propre permission.

export const DOMAINES = {
  commerce: {
    icone: 'caisse', sousTitre: 'Ventes, encaissements, retours, caisses et stock',
    actions: [
      { libelle: 'Nouvelle vente', icone: 'caisse', route: 'caisse', permission: 'caisse.utiliser', principal: true },
      { libelle: 'Ajouter un article', icone: 'plus', route: 'articles?nouveau=1', permission: 'articles.gerer' },
      { libelle: 'Inventaire', icone: 'inventaire', route: 'stock?vue=inventaire', permission: 'stock.ajuster' },
      { libelle: 'Transfert', icone: 'transfert', route: 'transferts?nouveau=1', permission: 'stock.transferer' },
      { libelle: 'Clôturer la caisse', icone: 'cloture', route: 'clotures', permission: 'cloture.cloturer' },
      { libelle: 'Voir les retours', icone: 'retour', route: 'ventes?vue=retours', permission: 'ventes.lire' },
    ],
  },
  restaurant: {
    icone: 'table', sousTitre: 'Salle, cuisine, réservations et additions',
    actions: [
      { libelle: 'Plan de salle', icone: 'table', route: 'salle', permission: 'restaurant_salle.lire', principal: true },
      { libelle: 'Nouvelle réservation', icone: 'calendrier', route: 'salle?vue=reservations&nouveau=1', permission: 'restaurant_salle.servir' },
      { libelle: 'Écran cuisine', icone: 'cuisine', route: 'cuisine', permission: 'restaurant_cuisine.lire' },
    ],
  },
  hotel: {
    icone: 'lit', sousTitre: 'Chambres, arrivées, départs, occupation et revenus',
    actions: [
      { libelle: 'Nouvelle réservation', icone: 'plus', route: 'hotel?nouveau=1', permission: 'hotel_reservations.gerer', principal: true },
      { libelle: 'Check-in', icone: 'coche', route: 'hotel?vue=arrivees', permission: 'hotel_reservations.sejour' },
      { libelle: 'Check-out', icone: 'sortie', route: 'hotel?vue=departs', permission: 'hotel_reservations.sejour' },
      { libelle: 'Chambres à nettoyer', icone: 'lit', route: 'chambres?menage=sale', permission: 'hotel_chambres.menage' },
      { libelle: 'Ajouter une prestation', icone: 'plus', route: 'hotel?statut=en_cours', permission: 'hotel_reservations.sejour' },
    ],
  },
  boutique: {
    icone: 'panier', sousTitre: 'Commandes en ligne, préparation, livraisons',
    actions: [
      { libelle: 'Commandes à confirmer', icone: 'panier', route: 'boutique?statut=nouvelle', permission: 'ecommerce_boutique.traiter', principal: true },
      { libelle: 'Produits publiés', icone: 'articles', route: 'boutique?vue=produits', permission: 'ecommerce_boutique.lire' },
    ],
  },
  facturation: {
    icone: 'facture', sousTitre: 'Devis, factures, échéances et encaissements',
    actions: [
      { libelle: 'Nouvelle facture', icone: 'plus', route: 'factures/nouvelle-facture', permission: 'facturation.gerer', principal: true },
      { libelle: 'Nouveau devis', icone: 'document', route: 'factures/nouveau-devis', permission: 'facturation.gerer' },
      { libelle: 'Factures en retard', icone: 'alerte', route: 'factures?etat=En retard', permission: 'facturation.lire' },
    ],
  },
  tresorerie: {
    icone: 'ventes', sousTitre: 'Encaissé, dépenses et solde de la période',
    actions: [
      { libelle: 'Nouvelle dépense', icone: 'plus', route: 'depenses?nouveau=1', permission: 'depenses.gerer', principal: true },
      { libelle: 'Rapports', icone: 'graphique', route: 'rapports', permission: 'rapports.lire' },
    ],
  },
  crm: {
    icone: 'cible', sousTitre: 'Prospects, opportunités, relances et conversion',
    actions: [
      { libelle: 'Nouvelle opportunité', icone: 'plus', route: 'crm?nouveau=1', permission: 'crm_pipeline.gerer', principal: true },
      { libelle: 'Relances à faire', icone: 'calendrier', route: 'crm?vue=activites', permission: 'crm_pipeline.lire' },
      { libelle: 'Nouveau contact', icone: 'contacts', route: 'contacts?nouveau=1', permission: 'contacts.gerer' },
    ],
  },
  achats: {
    icone: 'camion', sousTitre: 'Demandes, commandes, réceptions et fournisseurs',
    actions: [
      { libelle: 'Nouvelle commande', icone: 'plus', route: 'achats?nouveau=1', permission: 'achats.gerer', principal: true },
      { libelle: 'Demande d’achat', icone: 'document', route: 'achats?nouveau=demande', permission: 'achats.demander' },
      { libelle: 'Réceptionner', icone: 'stock', route: 'achats?onglet=en_cours', permission: 'achats.recevoir' },
    ],
  },
  livraisons: {
    icone: 'camion', sousTitre: 'Livraisons du jour, tournées, échecs et encaissements',
    actions: [
      { libelle: 'Nouvelle livraison', icone: 'plus', route: 'livraisons?nouveau=1', permission: 'livraisons.gerer', principal: true },
      { libelle: 'Échecs à replanifier', icone: 'alerte', route: 'livraisons?statut=echec', permission: 'livraisons.lire' },
    ],
  },
  location: {
    icone: 'cle', sousTitre: 'Objets loués, retours, cautions et revenus',
    actions: [
      { libelle: 'Nouvelle location', icone: 'plus', route: 'location', permission: 'location.louer', principal: true },
      { libelle: 'Retours en retard', icone: 'alerte', route: 'location?statut=en_cours', permission: 'location.lire' },
      { libelle: 'Parc', icone: 'cle', route: 'location?vue=parc', permission: 'location.lire' },
    ],
  },
  production: {
    icone: 'inventaire', sousTitre: 'Ordres de fabrication, recettes et coût des composants',
    actions: [
      { libelle: 'Ordres à fabriquer', icone: 'inventaire', route: 'production?statut=planifie', permission: 'production.lire', principal: true },
      { libelle: 'Recettes', icone: 'document', route: 'production?vue=recettes', permission: 'production.gerer' },
    ],
  },
  rh: {
    icone: 'organigramme', sousTitre: 'Effectif, présences, congés et contrats',
    actions: [
      { libelle: 'Présences du jour', icone: 'horloge', route: 'presences', permission: 'rh_presences.lire', principal: true },
      { libelle: 'Demandes de congé', icone: 'calendrier', route: 'conges?statut=demandee', permission: 'rh_conges.valider' },
      { libelle: 'Nouvel employé', icone: 'plus', route: 'employes?nouveau=1', permission: 'rh_employes.gerer' },
    ],
  },
  projets: {
    icone: 'taches', sousTitre: 'Projets, tâches, temps et facturation',
    actions: [
      { libelle: 'Saisir du temps', icone: 'horloge', route: 'projets?vue=temps', permission: 'projets.contribuer', principal: true },
      { libelle: 'Nouveau projet', icone: 'plus', route: 'projets?nouveau=1', permission: 'projets.gerer' },
    ],
  },
  agenda: {
    icone: 'calendrier', sousTitre: 'Rendez-vous, confirmations et présences',
    actions: [{ libelle: 'Nouveau rendez-vous', icone: 'plus', route: 'agenda?nouveau=1', permission: 'agenda.gerer', principal: true }],
  },
  support: {
    icone: 'message', sousTitre: 'Tickets, urgences et délais',
    actions: [{ libelle: 'Nouveau ticket', icone: 'plus', route: 'support?nouveau=1', permission: 'support_tickets.traiter', principal: true }],
  },
  abonnements: {
    icone: 'repeter', sousTitre: 'Abonnés, revenu récurrent et échéances',
    actions: [{ libelle: 'Nouvel abonnement', icone: 'plus', route: 'abonnements?nouveau=1', permission: 'abonnements.gerer', principal: true }],
  },
  fidelite: {
    icone: 'etoile', sousTitre: 'Clients fidèles, points et récompenses',
    actions: [{ libelle: 'Programme de fidélité', icone: 'etoile', route: 'fidelite', permission: 'fidelite.lire', principal: true }],
  },
  siteweb: {
    icone: 'globe', sousTitre: 'Messages reçus et pages publiées',
    actions: [{ libelle: 'Messages du site', icone: 'globe', route: 'siteweb?vue=messages', permission: 'site_web.lire', principal: true }],
  },
};

export function actionsDomaine(domaine, peut) {
  return (DOMAINES[domaine]?.actions ?? []).filter((a) => peut(a.permission));
}

// Périodes proposées. Les dates sont celles de l'appareil (même fuseau que l'établissement en pratique).
export const PERIODES = [
  ['jour', 'Aujourd’hui'], ['hier', 'Hier'], ['7j', '7 jours'], ['30j', '30 jours'], ['mois', 'Ce mois'], ['annee', 'Cette année'], ['perso', 'Personnalisée'],
];

function iso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function bornesPeriode(periode, perso = {}, maintenant = new Date()) {
  const jour = (decalage) => { const d = new Date(maintenant); d.setDate(d.getDate() + decalage); return iso(d); };
  switch (periode) {
    case 'hier': return { du: jour(-1), au: jour(-1) };
    case '7j': return { du: jour(-6), au: jour(0) };
    case '30j': return { du: jour(-29), au: jour(0) };
    case 'mois': return { du: iso(new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)), au: jour(0) };
    case 'annee': return { du: iso(new Date(maintenant.getFullYear(), 0, 1)), au: jour(0) };
    case 'perso': {
      const du = perso.du || jour(-6);
      const au = perso.au || jour(0);
      return du <= au ? { du, au } : { du: au, au: du };
    }
    default: return { du: jour(0), au: jour(0) };
  }
}

// Une hausse est-elle une bonne nouvelle pour cet indicateur ? (sinon le sens de la couleur s'inverse)
const HAUSSE_DEFAVORABLE = new Set(['remboursements', 'sorties', 'depenses', 'annulations', 'retard', 'retours', 'absences', 'en_retard', 'crees', 'taches_retard', 'activites_retard']);

export function variation(kpi) {
  const p = Number(kpi.precedent);
  const v = Number(kpi.valeur);
  if (kpi.precedent == null || !Number.isFinite(p) || p <= 0 || !Number.isFinite(v)) return null;
  const pourcent = Math.round(((v - p) / p) * 100);
  const favorable = pourcent === 0 ? null : (pourcent > 0) !== HAUSSE_DEFAVORABLE.has(kpi.cle);
  return { pourcent, favorable };
}
