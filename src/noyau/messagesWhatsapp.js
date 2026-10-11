// Textes prêts à envoyer par WhatsApp (rappels de dette, relances de facture, message à plusieurs clients) et liens
// wa.me. Rien ne part tout seul : la personne ouvre le lien, relit le message dans WhatsApp et appuie sur « Envoyer ».
// Fonctions pures (aucun accès réseau ni à la page) : testées dans tests/messages_whatsapp.test.js.

// Indicatif par défaut : Congo-Brazzaville (06 123 45 67 → 242 06 123 45 67, le 0 reste dans le numéro).
export const INDICATIF_PAR_DEFAUT = '242';

// Numéro au format wa.me (chiffres seulement, avec indicatif) ; '' si le numéro est vide ou trop court.
// « +… » ou « 00… » : déjà international. Numéro local à 9 chiffres commençant par 0 (format du Congo) : on ajoute
// l'indicatif. Autre forme : laissée telle quelle (la personne vérifiera dans WhatsApp).
export function numeroWhatsApp(telephone, indicatif = INDICATIF_PAR_DEFAUT) {
  const brut = String(telephone ?? '').trim().replace(/[\s.\-()]/g, '');
  let chiffres = brut.replace(/\D/g, '');
  if (chiffres.length < 6) return '';
  if (brut.startsWith('+')) return chiffres;
  if (chiffres.startsWith('00')) return chiffres.slice(2);
  if (indicatif && chiffres.length === 9 && chiffres.startsWith('0')) chiffres = `${indicatif}${chiffres}`;
  return chiffres;
}

// Lien wa.me prérempli. Sans numéro valable : wa.me/?text=… (WhatsApp demande à qui l'envoyer).
export function lienWhatsApp(telephone, texte, indicatif = INDICATIF_PAR_DEFAUT) {
  const numero = numeroWhatsApp(telephone, indicatif);
  const parametre = texte ? `?text=${encodeURIComponent(texte)}` : '';
  return `https://wa.me/${numero}${parametre}`;
}

// Ton d'une relance selon les jours de retard : rappel avant l'échéance, doux la première quinzaine (vers J+7),
// plus ferme à partir de J+15, très ferme après deux mois.
export function tonRelance(jours) {
  const j = Number(jours) || 0;
  if (j <= 0) return 'rappel';
  if (j < 15) return 'doux';
  if (j <= 60) return 'ferme';
  return 'tres_ferme';
}

const signature = (emetteur) => (emetteur ? `Merci, ${emetteur}` : 'Merci beaucoup.');
const salutation = (nom) => (String(nom ?? '').trim() ? `Bonjour ${String(nom).trim()},` : 'Bonjour,');

// « Qui me doit ? » : rappel poli d'une dette client (ventes à crédit, factures). montant : fonction de format (FCFA).
// depuis : date déjà mise en forme (« 12/09/2026 ») ; jours : ancienneté de la plus vieille dette.
export function messageRappelClient({ nom, total, montant, depuis, jours = 0, emetteur }) {
  const somme = montant(total);
  const quand = depuis ? ` (depuis le ${depuis})` : '';
  if (tonRelance(jours) === 'ferme' || tonRelance(jours) === 'tres_ferme') {
    return [
      salutation(nom),
      `Nous revenons vers vous au sujet de la somme de ${somme} qui reste à régler${quand}.`,
      'Merci de passer la régler au plus vite, ou de nous dire aujourd’hui quand le paiement est prévu.',
      signature(emetteur),
    ].join('\n');
  }
  return [
    salutation(nom),
    `Petit rappel amical : il reste ${somme} à régler pour vos achats${quand}.`,
    'Vous pouvez passer régler quand cela vous arrange, ou nous dire quand c’est possible.',
    signature(emetteur),
  ].join('\n');
}

// Relance de factures émises : factures = [{ numero, reste, jours }]. Le ton suit la facture la plus en retard.
export function messageRelanceFactures({ nom, factures, montant, emetteur }) {
  const retard = Math.max(...factures.map((f) => Number(f.jours) || 0));
  const ton = tonRelance(retard);
  const plusieurs = factures.length > 1;
  const ouverture = {
    rappel: `${salutation(nom)} pour rappel, ${plusieurs ? 'les factures suivantes arrivent' : 'la facture suivante arrive'} à échéance :`,
    doux: `${salutation(nom)} sauf erreur de notre part, ${plusieurs ? 'les factures suivantes sont arrivées' : 'la facture suivante est arrivée'} à échéance :`,
    ferme: `${salutation(nom)} nous n’avons pas encore reçu le règlement ${plusieurs ? 'des factures suivantes, échues' : 'de la facture suivante, échue'} depuis plus de deux semaines :`,
    tres_ferme: `${salutation(nom)} malgré nos précédents rappels, ${plusieurs ? 'les factures suivantes restent impayées' : 'la facture suivante reste impayée'} :`,
  }[ton];
  const lignes = factures.map((f) => `- ${f.numero} : ${montant(f.reste)}${f.jours > 0 ? ` (en retard de ${f.jours} j)` : ''}`);
  const total = factures.reduce((s, f) => s + Number(f.reste), 0);
  const fin = {
    rappel: 'Merci de prévoir le règlement à la date indiquée.',
    doux: 'Merci de procéder au règlement ou de nous indiquer la date prévue.',
    ferme: 'Merci de régler rapidement ou de nous dire dès aujourd’hui quand le paiement sera fait.',
    tres_ferme: 'Merci de régler ce montant sans délai ou de nous contacter pour convenir d’un échéancier.',
  }[ton];
  return [ouverture, ...lignes, `Total : ${montant(total)}.`, fin, emetteur ? `Cordialement, ${emetteur}` : 'Cordialement.'].join('\n');
}

// Message à plusieurs clients : {nom} est remplacé par le nom de chaque client (sinon le texte reste tel quel).
export function personnaliserMessage(modele, contact) {
  const nom = String(contact?.nom ?? '').trim();
  return String(modele ?? '').replace(/\{nom\}/gi, nom || 'cher client').trim();
}

// Liens d'un envoi groupé : un lien par contact qui a un numéro ; les autres sont rendus à part (sans numéro).
export function liensGroupe(contacts, modele, indicatif = INDICATIF_PAR_DEFAUT) {
  const avec = [];
  const sans = [];
  for (const c of contacts) {
    if (numeroWhatsApp(c.telephone, indicatif)) avec.push({ contact: c, url: lienWhatsApp(c.telephone, personnaliserMessage(modele, c), indicatif) });
    else sans.push(c);
  }
  return { avec, sans };
}
