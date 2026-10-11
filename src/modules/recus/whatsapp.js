import { formatDateHeure, formatMontant, formatQuantite } from '../../noyau/format.js';

// Reçu envoyé sur WhatsApp : un texte court, ouvert dans WhatsApp par un lien wa.me (jamais d'envoi automatique).

// recu : la réponse de recu_vente (vente, etablissement, identite, documents, contact, lignes, paiements).
export function texteRecuWhatsApp(recu) {
  const { vente, etablissement, lignes = [], paiements = [] } = recu;
  const devise = etablissement?.devise;
  const m = (n) => formatMontant(n, devise);
  const nom = recu.identite?.nom_commercial ?? recu.documents?.nom_commercial ?? etablissement?.nom ?? '';
  const paye = paiements.filter((p) => p.statut === 'valide').reduce((s, p) => s + Number(p.montant || 0), 0);
  const reste = Math.max(Number(vente.total || 0) - Number(vente.montant_paye ?? paye), 0);
  const texte = [
    `*${nom}*`,
    `Reçu ${vente.numero} du ${formatDateHeure(vente.cree_le)}`,
    '',
    ...lignes.map((l) => `${l.libelle} : ${formatQuantite(l.quantite)} × ${m(l.prix_unitaire)} = ${m(l.total)}`),
    '',
  ];
  if (Number(vente.remise) > 0) texte.push(`Remise : − ${m(vente.remise)}`);
  texte.push(`*Total : ${m(vente.total)}*`);
  texte.push(`Payé : ${m(vente.montant_paye ?? paye)}`);
  if (reste > 0 && vente.statut !== 'annulee') texte.push(`Reste dû : ${m(reste)}`);
  if (vente.statut === 'annulee') texte.push('VENTE ANNULÉE');
  texte.push('', 'Merci de votre visite !');
  return texte.join('\n');
}

// Numéro pour wa.me : chiffres seulement. « + » ou « 00 » devant = indicatif international déjà présent.
// Un numéro local du Congo (9 chiffres commençant par 0, ex. 06 123 45 67) reçoit l'indicatif 242.
export function numeroWhatsApp(telephone) {
  const brut = String(telephone ?? '').trim();
  let chiffres = brut.replace(/\D/g, '');
  if (!brut.startsWith('+') && chiffres.startsWith('00')) return chiffres.slice(2);
  if (!brut.startsWith('+') && chiffres.length === 9 && chiffres.startsWith('0')) chiffres = `242${chiffres}`;
  return chiffres;
}

export function lienRecuWhatsApp(recu) {
  const numero = numeroWhatsApp(recu.contact?.telephone);
  return `https://wa.me/${numero}?text=${encodeURIComponent(texteRecuWhatsApp(recu))}`;
}
