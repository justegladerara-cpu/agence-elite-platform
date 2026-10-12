import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';
import { delaiVerrouillage } from '../src/modules/caisse/verrouCaisse.js';
import { nomsServeurs } from '../src/modules/caisse/serviPar.js';

// Plus de fermeture à minuit par défaut, verrouillage sans activité, « Servi par » (migration 20261011000129).
let db;
let gerant;
let awa;
let binta;
let etab;
let article;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const vendre = (user, session) => valeur(user, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
  etab, session, JSON.stringify([{ article_id: article, quantite: 1 }]), JSON.stringify([{ mode: 'especes', montant: 500 }]),
]);

beforeAll(async () => {
  db = await creerBase();
  const admin = await utilisateur('admin@verrou.test');
  gerant = await utilisateur('gerant@verrou.test');
  awa = await utilisateur('awa@verrou.test');
  binta = await utilisateur('binta@verrou.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Verrou Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Bar Verrou')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'employe')", [etab, gerant, awa, binta]);
  article = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Bière test', prix_vente: 500, suivi_stock: false })]);
});

afterAll(async () => db.close());

describe('la caisse ne se ferme plus toute seule à minuit', () => {
  test('par défaut : jamais de fermeture automatique, une caisse de plus de 24 h reste ouverte', async () => {
    expect(await valeur(gerant, 'select fin_journee_caisse($1)', [etab])).toBeNull();
    const caisse = await valeur(awa, 'select ouvrir_caisse($1, null, 0)', [etab]);
    await db.transaction(async (tx) => {
      await tx.query("set local session_replication_role = 'replica'");
      await tx.query("update sessions_caisse set ouverte_le = now() - interval '30 hours' where id = $1", [caisse]);
    });
    expect(await valeur(awa, 'select fermer_caisses_du_jour($1)', [etab])).toBe(0);
    expect((await vendre(awa, caisse)).numero).toBeTruthy();
  });

  test('une heure choisie exprès reste possible', async () => {
    await comme(gerant, "select enregistrer_parametres_module($1, 'cloture', '{\"fermeture_automatique\": \"04:00\"}'::jsonb)", [etab]);
    expect(await valeur(gerant, 'select fin_journee_caisse($1)', [etab])).not.toBeNull();
    await comme(gerant, "select enregistrer_parametres_module($1, 'cloture', '{\"fermeture_automatique\": \"\"}'::jsonb)", [etab]);
  });

  test('réglage de verrouillage : 15 minutes par défaut, déclaré dans le module Clôture', async () => {
    const schema = (await db.query("select parametres_schema from modules where id = 'cloture'")).rows[0].parametres_schema;
    expect(schema.find((d) => d.cle === 'verrouillage_inactivite').defaut).toBe(15);
    expect(schema.find((d) => d.cle === 'fermeture_automatique').defaut).toBe('');
  });
});

describe('servi par', () => {
  test('la caissière indique le serveur de sa vente ; une autre caissière ne peut pas', async () => {
    const caisse = await valeur(awa, 'select ouvrir_caisse($1, null, 0)', [etab]);
    const vente = await vendre(awa, caisse);
    await comme(awa, "select indiquer_serveur_vente($1, '  Alex  ')", [vente.vente_id]);
    expect((await db.query('select servi_par from ventes where id = $1', [vente.vente_id])).rows[0].servi_par).toBe('Alex');
    await expect(comme(binta, "select indiquer_serveur_vente($1, 'Marc')", [vente.vente_id])).rejects.toThrow(/Permission refusée/);
    // Le responsable peut corriger.
    await comme(gerant, "select indiquer_serveur_vente($1, 'Marc')", [vente.vente_id]);
    expect((await db.query('select servi_par from ventes where id = $1', [vente.vente_id])).rows[0].servi_par).toBe('Marc');
    // Vide = retiré.
    await comme(awa, "select indiquer_serveur_vente($1, '')", [vente.vente_id]);
    expect((await db.query('select servi_par from ventes where id = $1', [vente.vente_id])).rows[0].servi_par).toBeNull();
  });
});

describe('verrouillage côté écran', () => {
  test('délai : 15 min par défaut, 0 = jamais', () => {
    expect(delaiVerrouillage(null)).toBe(15);
    expect(delaiVerrouillage({ verrouillage_inactivite: 5 })).toBe(5);
    expect(delaiVerrouillage({ verrouillage_inactivite: 0 })).toBe(0);
  });
  test('noms proposés : réglage puis récents, sans doublon', () => {
    expect(nomsServeurs('Alex, Marc ,, alex', ['marc', 'Paul'])).toEqual(['Alex', 'Marc', 'Paul']);
  });
});
