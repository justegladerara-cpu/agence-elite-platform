// Sites clients rattachés à la plateforme : applications développées par Agence Elite pour un client et
// hébergées à part (leur propre Worker Cloudflare et leur propre base). Elles exposent une API
// d'administration qui n'accepte que les Super Admins de la plateforme : le site reçoit le jeton de session
// Supabase et demande lui-même à la base (`est_super_admin`) si la personne est Super Admin. Aucun secret.
//
// Ajouter un site : une entrée ici + son adresse dans `connect-src` de public/_headers (test sites_clients).

export const SITES_CLIENTS = [
  {
    id: 'express-congo',
    nom: 'Express Congo',
    client: 'Express Congo',
    description: 'Fret de la France vers le Congo : site public, devis, suivi et logiciel de gestion des agences.',
    adresse: 'https://express-congo.justegladerara.workers.dev',
    agences: { paris: 'Paris', brazzaville: 'Brazzaville', 'pointe-noire': 'Pointe-Noire' },
  },
];

export const ROLES_SITE = {
  admin: 'Administrateur',
  manager: 'Responsable d’agence',
  agent: 'Agent',
  sales: 'Commercial',
  finance: 'Finance',
  client: 'Client',
};

export const ACTIONS_JOURNAL_SITE = {
  'account.created': 'Compte créé',
  'account.role': 'Rôle modifié',
  'account.disable': 'Compte désactivé',
  'account.enable': 'Compte réactivé',
  'account.reset_link': 'Lien de mot de passe créé',
  'account.sessions_revoked': 'Sessions fermées',
  'account.registered': 'Inscription client',
  'account.verified': 'Adresse confirmée',
  'account.reset': 'Mot de passe changé',
  'access.demo_public': 'Démo publique modifiée',
  'platform.session': 'Ouverture depuis la plateforme',
  'payments.settings': 'Moyens de paiement modifiés',
  'payment.created': 'Encaissement enregistré',
  'proposal.created': 'Proposition envoyée',
  'proposal.accepted': 'Proposition acceptée',
  'shipment.created': 'Expédition ouverte',
  'shipment.updated': 'Expédition mise à jour',
  'shipment.transferred': 'Expédition transférée',
  'parcel.created': 'Colis réceptionné',
  'departure.created': 'Départ programmé',
  'departure.updated': 'Départ mis à jour',
  'event.created': 'Suivi mis à jour',
  'quote.created': 'Demande de devis reçue',
  'quote.status': 'Demande de devis traitée',
  'ticket.created': 'Demande d’assistance',
  'ticket.updated': 'Réponse d’assistance',
};

export function trouverSite(id) {
  return SITES_CLIENTS.find((s) => s.id === id) ?? null;
}

// Appel de l'API d'administration d'un site avec le jeton de session de la personne connectée.
// `chemin` : « etat », « comptes », « journal », « acces », « session ». La barre finale est obligatoire
// (le site redirige sinon, ce que le navigateur refuse pour une requête d'une autre origine).
export async function appelerSite(site, chemin, { jeton, methode = 'GET', corps, f = fetch } = {}) {
  if (!jeton) throw new Error('Session expirée : reconnectez-vous');
  let rep;
  try {
    rep = await f(`${site.adresse}/api/plateforme/${chemin}/`, {
      method: methode,
      headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
  } catch {
    throw new Error(`${site.nom} ne répond pas : le site n’est peut-être pas encore en ligne`);
  }
  const donnees = await rep.json().catch(() => null);
  if (!rep.ok || !donnees) throw new Error(donnees?.erreur ?? `${site.nom} : service indisponible (${rep.status})`);
  return donnees;
}
