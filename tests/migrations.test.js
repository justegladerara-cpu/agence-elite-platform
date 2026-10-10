import { describe, expect, test } from 'vitest';
import { readdir } from 'node:fs/promises';
import { creerBase } from './helpers/db.js';

const tablesAttendues = ['abo_formules','abonnement_periodes','abonnements','agenda_rendez_vous','articles','boutique_articles','boutique_commandes','boutique_coupons','boutique_lignes','boutiques','categories_articles','categories_modules','client_identite','client_membres','clients','clotures','commandes_achat','compta_affectations','compta_comptes','compta_ecritures','compta_journaux','compta_lignes','comptes_connexion','contact_interlocuteurs','contacts','contrat_avenants','contrats','crm_activites','crm_criteres','crm_etapes','crm_opportunites','crm_reponses','depenses','documents_dossiers','documents_vente','echeances_document','etablissement_identite','etablissement_membres','etablissement_modules','etablissement_parametres','etablissements','evenements','fichiers','fidelite_attributions','fidelite_mouvements','fidelite_recompenses','hotel_chambres','hotel_prestations','hotel_reservations','hotel_types_chambre','hubs','immo_affectations','immo_baux','immo_biens','immo_cautions','immo_echeances','immo_encaissements','immo_incidents','immo_locataires','immo_proprietaires','immo_reversements','integrations_connexions','integrations_journal','integrations_secrets','inventaires','invitations','journal_audit','licence_evenements','licences','lignes_commande_achat','lignes_document_vente','lignes_inventaire','lignes_reception_achat','lignes_retour_vente','lignes_transfert','lignes_vente','liv_livraisons','liv_tournees','loc_contrats','loc_lignes','loc_objets','loc_paiements','membre_hubs','mkt_campagnes','mkt_consentements','mkt_destinataires','mkt_segments','module_dependances','modules','mouvements_stock','notifications','numerotations','offres','options_modules','pages_auth','pages_auth_journal','paiements','paiements_fournisseur','permissions','pieces_jointes','plateforme_admins','plateforme_identite','points_de_vente','prod_nomenclatures','prod_ordres','profils','projet_checklist','projet_journal','projet_livrable_versions','projet_livrables','projet_taches','projet_temps','projets','receptions_achat','remboursements_vente','rest_affectations','rest_commandes','rest_lignes','rest_reservations','rest_tables','rest_transferts_serveur','retours_vente','rh_absences','rh_ajustements_conges','rh_contrats','rh_creneaux','rh_departements','rh_employes','rh_employes_prives','rh_horaires','rh_jours_feries','rh_pointages','rh_postes','role_permissions','roles','sco_annees','sco_classes','sco_eleves','sco_inscriptions','sco_paiements','sessions_caisse','sessions_support','site_messages','site_pages','sites','solution_modules','solutions','support_bibliotheque','support_messages','support_tickets','tentatives_connexion','transferts','types_pieces_jointes','ventes','ventes_en_attente'];

describe('migrations', () => {
  test('leurs noms sont valides et uniques', async () => {
    const noms = (await readdir('supabase/migrations')).filter((n) => n.endsWith('.sql'));
    expect(noms.every((n) => /^\d{14}_[a-z0-9_]+\.sql$/.test(n))).toBe(true);
    expect(new Set(noms).size).toBe(noms.length);
  });
  test('deux bases neuves se construisent', async () => {
    const [a, b] = await Promise.all([creerBase(), creerBase()]);
    await a.close(); await b.close();
  });
  test('les tables attendues existent (et seulement elles)', async () => {
    const db = await creerBase();
    const { rows } = await db.query("select tablename from pg_tables where schemaname='public' order by tablename");
    expect(rows.map((r) => r.tablename)).toEqual(tablesAttendues);
    await db.close();
  });
});
