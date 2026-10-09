// Catalogue des intégrations, partagé par l'écran Paramètres › Connexions et le serveur (serveur/integrations/).
// Aucun fournisseur n'est imposé : chaque famille passe par un adaptateur. Statuts honnêtes :
// - « disponible_test » : adaptateur réel, utilisable en mode test (bac à sable interne, aucun appel externe) ;
// - « prevu » : famille déclarée, adaptateur pas encore écrit ou pas encore testé contre le bac à sable du fournisseur.
// Une intégration ne passe « Disponible » qu'après un test réussi contre le vrai bac à sable du fournisseur.
export const INTEGRATIONS = [
  {
    id: 'simulation', nom: 'Bac à sable Agence Elite', famille: 'Essai', statut: 'disponible_test',
    description: 'Fournisseur fictif pour essayer une connexion, un test et la réception d’événements signés, sans rien envoyer à l’extérieur.',
    champs: [{ cle: 'libelle', libelle: 'Nom de la connexion', type: 'texte' }],
    secret: { libelle: 'Clé fictive (au moins 8 caractères)' },
  },
  {
    id: 'mobile_money', nom: 'Mobile Money', famille: 'Paiement', statut: 'prevu',
    bloque: 'agrégateur à choisir et accès à son bac à sable',
    description: 'Encaisser en caisse, en boutique en ligne et sur les factures par Mobile Money.',
  },
  {
    id: 'carte', nom: 'Paiement par carte', famille: 'Paiement', statut: 'prevu',
    bloque: 'compte de test du prestataire de paiement par carte',
    description: 'Paiement en ligne des factures et de la boutique.',
  },
  {
    id: 'whatsapp', nom: 'WhatsApp Business', famille: 'Messages', statut: 'prevu',
    bloque: 'compte WhatsApp Business et numéro de test',
    description: 'Reçus, confirmations de réservation, relances de factures.',
  },
  {
    id: 'email', nom: 'E-mail transactionnel', famille: 'Messages', statut: 'prevu',
    bloque: 'fournisseur d’envoi d’e-mails à choisir',
    description: 'Factures, invitations, relances envoyées depuis la plateforme.',
  },
  {
    id: 'sms', nom: 'SMS', famille: 'Messages', statut: 'prevu',
    bloque: 'fournisseur SMS à choisir',
    description: 'Rappels de rendez-vous, codes, relances courtes.',
  },
  {
    id: 'agenda_externe', nom: 'Google / Microsoft', famille: 'Agenda et contacts', statut: 'prevu',
    bloque: 'application OAuth à déclarer chez Google ou Microsoft',
    description: 'Synchroniser l’agenda et les contacts.',
  },
  {
    id: 'comptabilite', nom: 'Logiciel comptable', famille: 'Comptabilité', statut: 'prevu',
    bloque: 'logiciel cible à choisir (après le module Comptabilité)',
    description: 'Envoyer les écritures de ventes, achats et dépenses.',
  },
  {
    id: 'channel_manager', nom: 'Channel manager', famille: 'Hôtel', statut: 'prevu',
    bloque: 'channel manager à choisir',
    description: 'Disponibilités et réservations des plateformes de réservation en ligne.',
  },
  {
    id: 'commandes_externes', nom: 'Livraison de repas et réseaux sociaux', famille: 'Commandes', statut: 'prevu',
    bloque: 'plateforme à choisir',
    description: 'Recevoir les commandes des plateformes de livraison et des réseaux sociaux.',
  },
  {
    id: 'materiel_caisse', nom: 'Matériel de caisse', famille: 'Caisse', statut: 'prevu',
    bloque: 'matériel à valider (imprimante, tiroir, lecteur) ; webhooks sortants à brancher',
    description: 'Imprimante de tickets, tiroir-caisse, lecteur, webhooks signés vers vos outils.',
  },
];

export const LIBELLES_STATUT_INTEGRATION = { disponible_test: ['Bêta : mode test', 'bleu'], prevu: ['Prévu', 'neutre'] };

export function integration(id) {
  return INTEGRATIONS.find((i) => i.id === id) ?? null;
}

// Aperçu d'une clé, seule trace lisible après saisie : « ••••abcd ».
export function apercuSecret(secret) {
  const s = String(secret ?? '');
  return s.length >= 8 ? `••••${s.slice(-4)}` : '••••';
}
