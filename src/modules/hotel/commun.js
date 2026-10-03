// Libellés et petits calculs partagés par la réception et les chambres.
import { dateLocale } from '../../noyau/format.js';

export const STATUTS_RESERVATION = {
  confirmee: ['Confirmée', 'bleu'],
  en_cours: ['En séjour', 'vert'],
  terminee: ['Partie', 'neutre'],
  annulee: ['Annulée', 'rouge'],
  no_show: ['Absent', 'orange'],
};
export const MENAGE = {
  propre: ['Propre', 'vert'],
  sale: ['À nettoyer', 'orange'],
  en_nettoyage: ['En nettoyage', 'bleu'],
  hors_service: ['Hors service', 'rouge'],
};
export const SOURCES = {
  direct: 'Sur place', telephone: 'Téléphone', whatsapp: 'WhatsApp', site_web: 'Site web', agence: 'Agence', plateforme: 'Plateforme en ligne', autre: 'Autre',
};

export function ajouterJours(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function nuits(arrivee, depart) {
  return Math.max(0, Math.round((new Date(`${depart}T12:00:00Z`) - new Date(`${arrivee}T12:00:00Z`)) / 86400000));
}
export const aujourdhui = () => dateLocale();
