// Rapport du soir envoyé au patron sur WhatsApp (migration 20261017000137, fonction rapport_du_soir).
// Fonctions pures (aucun accès réseau ni à la page) : testées dans tests/rapport_du_soir.test.js.
// Rien ne part tout seul : l'écran ouvre WhatsApp avec le texte prêt, la personne appuie sur « Envoyer ».
import { formatMontant, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { lienWhatsApp } from '../../noyau/messagesWhatsapp.js';

// Avant cette heure, l'écran propose le rapport de la veille (un bar qui ferme à 2 h envoie le rapport de sa soirée).
export const HEURE_CHANGEMENT_DE_JOUR = 6;

const deuxChiffres = (n) => String(n).padStart(2, '0');
const jourIso = (d) => `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;

// Date proposée par défaut (AAAA-MM-JJ, heure de l'appareil) : aujourd'hui, ou hier avant l'heure de début du service
// (6 h si rien n'est dit ; réglage Clôture « debut_service », 8 h par défaut à l'écran, migration 20261024040000).
export function dateRapportParDefaut(maintenant = new Date(), heure = HEURE_CHANGEMENT_DE_JOUR) {
  const d = new Date(maintenant);
  if (d.getHours() < heure) d.setDate(d.getDate() - 1);
  return jourIso(d);
}

// Heure de début du service réglée par l'établissement (Paramètres › Clôture) : 8 h par défaut (The Dream tourne
// 24 h sur 24, la relève se fait le matin).
export const DEBUT_SERVICE_PAR_DEFAUT = 8;
export function heureDebutService(reglages) {
  const h = Number(reglages?.cloture?.debut_service);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : DEBUT_SERVICE_PAR_DEFAUT;
}

// Jour de service en cours pour cet établissement.
export const jourDeService = (reglages, maintenant = new Date()) => dateRapportParDefaut(maintenant, heureDebutService(reglages));

// « lundi 12 octobre 2026 » à partir de « 2026-10-12 ».
export function dateEnLettres(date) {
  if (!date) return '';
  return new Date(`${String(date).slice(0, 10)}T12:00:00`)
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Écart de caisse en mots : « manque 200 FCFA », « 500 FCFA en trop », « aucun écart ».
export function ecartEnMots(ecart, devise) {
  const n = Number(ecart || 0);
  if (n < 0) return `manque ${formatMontant(-n, devise)}`;
  if (n > 0) return `${formatMontant(n, devise)} en trop`;
  return 'aucun écart';
}

const pluriel = (n, mot, motPluriel = `${mot}s`) => `${n} ${Number(n) > 1 ? motPluriel : mot}`;

// Texte du rapport (gras WhatsApp avec *…*). rapport : la réponse de rapport_du_soir.
export function texteRapportDuSoir(rapport) {
  const r = rapport ?? {};
  const devise = r.devise ?? 'XAF';
  const m = (n) => formatMontant(n, devise);
  const lignes = [];
  lignes.push(`*Rapport du soir${r.etablissement ? ` · ${r.etablissement}` : ''}*`);
  if (r.date) lignes.push(dateEnLettres(r.date));
  lignes.push('');
  lignes.push(`*Ventes : ${m(r.total_ventes)}*`);
  lignes.push(`Tickets : ${Number(r.nombre_tickets || 0)}`);
  if (r.heure_forte) lignes.push(`Heure la plus forte : ${r.heure_forte.heure} h (${m(r.heure_forte.montant)})`);
  if (r.plus_grosse_vente) lignes.push(`Plus grosse vente : ${m(r.plus_grosse_vente.montant)} à ${r.plus_grosse_vente.heure}`);

  const encaissements = (r.encaissements ?? []).filter((e) => Number(e.montant) > 0);
  if (encaissements.length) {
    lignes.push('', '*Encaissé*');
    for (const e of encaissements) lignes.push(`- ${MODES_PAIEMENT[e.mode] ?? e.mode} : ${m(e.montant)}`);
  }
  if (Number(r.credit) > 0) lignes.push(`Crédit accordé (reste à payer) : ${m(r.credit)}`);

  const articles = (r.top_articles ?? []).slice(0, 5);
  if (articles.length) {
    lignes.push('', '*Top 5 des articles*');
    articles.forEach((a, i) => lignes.push(`${i + 1}. ${a.libelle} : ${formatQuantite(a.quantite)} · ${m(a.total)}`));
  }

  lignes.push('');
  lignes.push(`Remises : ${m(r.total_remises)}`);
  const annulations = r.annulations ?? {};
  lignes.push(`Annulations : ${Number(annulations.nombre || 0)}${Number(annulations.nombre) > 0 ? ` (${m(annulations.montant)})` : ''}`);
  if (Number(r.retours?.nombre) > 0) lignes.push(`Retours remboursés : ${r.retours.nombre} (${m(r.retours.montant)})`);
  const depenses = r.depenses ?? {};
  lignes.push(`Dépenses : ${m(depenses.montant)}${Number(depenses.nombre) > 0 ? ` (${pluriel(depenses.nombre, 'dépense')})` : ''}`);

  const clotures = r.clotures ?? {};
  if (Number(clotures.nombre) > 0) {
    lignes.push(`Écart de caisse : ${ecartEnMots(clotures.ecart, devise)} (${pluriel(clotures.nombre, 'ticket Z', 'tickets Z')})`);
    if (Number(clotures.a_compter) > 0) lignes.push(`Espèces pas encore comptées : ${pluriel(clotures.a_compter, 'ticket Z', 'tickets Z')}`);
  } else {
    lignes.push('Écart de caisse : aucun ticket Z ce jour');
  }

  const caissiers = r.caissiers ?? [];
  if (caissiers.length) {
    lignes.push('', '*Par caissière / caissier*');
    for (const c of caissiers) lignes.push(`- ${c.nom || 'Sans nom'} : ${pluriel(c.nombre_ventes, 'vente')} · ${m(c.total_ventes)}`);
  }

  if (r.conseils?.length) {
    lignes.push('', '*Conseils*');
    for (const c of r.conseils) lignes.push(`- ${c}`);
  }

  lignes.push('');
  const ouvertes = Number(r.caisses_ouvertes || 0);
  lignes.push(ouvertes > 0 ? `Attention : ${pluriel(ouvertes, 'caisse encore ouverte', 'caisses encore ouvertes')}` : 'Toutes les caisses sont fermées');
  return lignes.join('\n');
}

// Lien wa.me prérempli. Sans numéro : WhatsApp demande à qui envoyer.
export function lienRapportWhatsApp(rapport, numero = rapport?.whatsapp_patron) {
  return lienWhatsApp(numero ?? '', texteRapportDuSoir(rapport));
}
