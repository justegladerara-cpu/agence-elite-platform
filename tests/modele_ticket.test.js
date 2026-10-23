import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';
import {
  basculerBloc, blocsADessiner, blocVisible, deplacerBloc, ecrireModele, lienQr, lireModele, MODELE_PAR_DEFAUT,
} from '../src/modules/recus/modeleTicket.js';

// Ticket de vente réglable (migration 20261023000159, modeleTicket.js). Données fictives uniquement.
describe('modèle du ticket', () => {
  test('sans modèle : le ticket d’avant (même ordre, QR caché, tout le reste visible)', () => {
    const m = lireModele(null);
    expect(m.blocs).toEqual(MODELE_PAR_DEFAUT.blocs);
    expect(m.caches).toEqual(['qr']);
    expect(m.infos).toEqual({ caisse: true, vendeur: true, servi_par: true, client: true });
    expect(lireModele('pas du json')).toEqual(m);
  });

  test('les mentions obligatoires ne se cachent jamais', () => {
    let m = lireModele(null);
    for (const id of ['numero', 'articles', 'legal', 'nom']) m = basculerBloc(m, id);
    expect(m.caches).toEqual(['qr']);
    expect(lireModele({ caches: ['articles', 'numero', 'adresse'] }).caches).toEqual(['adresse']);
  });

  test('cacher, déplacer, traits entre groupes ; aller-retour par le texte enregistré', () => {
    let m = basculerBloc(lireModele(null), 'adresse');
    m = deplacerBloc(m, 'message_bas', -1);
    expect(blocVisible(m, 'adresse')).toBe(false);
    expect(m.blocs.indexOf('message_bas')).toBeLessThan(m.blocs.indexOf('articles'));
    expect(deplacerBloc(m, 'logo', -1)).toBe(m);
    const d = blocsADessiner(m);
    expect(d.find((b) => b.id === 'numero').trait).toBe(true);
    expect(d.find((b) => b.id === 'nom').trait).toBe(false);
    expect(lireModele(ecrireModele(m))).toEqual(m);
  });

  test('un bloc inconnu est ignoré ; un bloc oublié revient à la fin ; textes coupés à 300', () => {
    const m = lireModele({ blocs: ['qr', 'pirate', 'qr', 'nom'], textes: { message_haut: 'x'.repeat(500) } });
    expect(m.blocs.slice(0, 2)).toEqual(['qr', 'nom']);
    expect(m.blocs).toHaveLength(MODELE_PAR_DEFAUT.blocs.length);
    expect(m.textes.message_haut).toHaveLength(300);
  });

  test('lien du QR code : https ou numéro WhatsApp', () => {
    expect(lienQr('https://instagram.com/bar')).toBe('https://instagram.com/bar');
    expect(lienQr('+242 06 000 00 00')).toBe('https://wa.me/242060000000');
    expect(lienQr('javascript:alert(1)')).toBeNull();
    expect(lienQr('')).toBeNull();
  });
});

describe('enregistrement', () => {
  let db;
  afterAll(async () => db?.close());
  beforeAll(async () => {
    db = await creerBase();
  });
  test('le patron enregistre le modèle dans les réglages caisse ; la caissière non', async () => {
    const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
    const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
    const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
    const admin = await utilisateur('admin@ticket.test');
    const patron = await utilisateur('patron@ticket.test');
    const awa = await utilisateur('awa@ticket.test');
    await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
    const client = await valeur(admin, "select creer_client('Ticket Démo')");
    const etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Bar Ticket Démo')", [client]);
    await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe')", [etab, patron, awa]);
    const texte = ecrireModele(basculerBloc(lireModele(null), 'qr'));
    await comme(patron, "select enregistrer_parametres_module($1, 'caisse', jsonb_build_object('modele_ticket', $2::text))", [etab, texte]);
    const lu = await comme(awa, "select data from etablissement_parametres where etablissement_id = $1 and module_id = 'caisse'", [etab]);
    expect(lu[0].data.modele_ticket).toBe(texte);
    await expect(comme(awa, "select enregistrer_parametres_module($1, 'caisse', '{\"modele_ticket\": \"{}\"}'::jsonb)", [etab])).rejects.toThrow();
    await expect(comme(patron, "select enregistrer_parametres_module($1, 'caisse', '{\"modele_ticket\": \"pas un modèle\"}'::jsonb)", [etab])).rejects.toThrow();
  });
});
