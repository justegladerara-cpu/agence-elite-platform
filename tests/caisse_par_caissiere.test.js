import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Une caisse par personne, un ticket Z par personne (migration 20261011000128).
let db;
let gerant;
let awa;
let binta;
let etab;
let article;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const vendre = (user, session, prix = 500) => valeur(user, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
  etab, session, JSON.stringify([{ article_id: article, quantite: prix / 500 }]), JSON.stringify([{ mode: 'especes', montant: prix }]),
]);

beforeAll(async () => {
  db = await creerBase();
  const admin = await utilisateur('admin@deux-caisses.test');
  gerant = await utilisateur('gerant@deux-caisses.test');
  awa = await utilisateur('awa@deux-caisses.test');
  binta = await utilisateur('binta@deux-caisses.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Deux Caisses Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique Deux Caisses')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'employe')", [etab, gerant, awa, binta]);
  await db.query("insert into profils(id, nom_complet) values ($1, 'Awa'), ($2, 'Binta') on conflict (id) do update set nom_complet = excluded.nom_complet", [awa, binta]);
  article = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Savon test', prix_vente: 500, suivi_stock: false })]);
});

afterAll(async () => db.close());

describe('une caisse par caissière', () => {
  let caisseAwa;
  let caisseBinta;

  test('deux caissières ouvrent chacune SA caisse sur le même point de vente', async () => {
    caisseAwa = await valeur(awa, 'select ouvrir_caisse($1, null, 1000)', [etab]);
    caisseBinta = await valeur(binta, 'select ouvrir_caisse($1, null, 2000)', [etab]);
    expect(caisseBinta).not.toBe(caisseAwa);
    // Rouvrir rend toujours SA propre caisse.
    expect(await valeur(awa, 'select ouvrir_caisse($1, null, 0)', [etab])).toBe(caisseAwa);
    const pdv = (await db.query('select distinct point_de_vente_id from sessions_caisse where id = any($1)', [[caisseAwa, caisseBinta]])).rows;
    expect(pdv).toHaveLength(1);
  });

  test('personne ne vend ni n’encaisse sur la caisse d’une autre', async () => {
    await vendre(awa, caisseAwa, 1000);
    await vendre(binta, caisseBinta, 500);
    await expect(vendre(binta, caisseAwa)).rejects.toThrow(/autre personne/);
    await expect(vendre(gerant, caisseAwa)).rejects.toThrow(/autre personne/);
    await expect(comme(binta, 'select mettre_vente_en_attente($1, $2::jsonb)', [caisseAwa, JSON.stringify([{ article_id: article, quantite: 1 }])]))
      .rejects.toThrow(/autre personne/);
  });

  test('une vente en attente ne se reprend que sur sa propre caisse (ou par un responsable)', async () => {
    const attente = await valeur(awa, 'select mettre_vente_en_attente($1, $2::jsonb)', [caisseAwa, JSON.stringify([{ article_id: article, quantite: 1 }])]);
    await expect(comme(binta, "select terminer_vente_en_attente($1, 'abandonner')", [attente])).rejects.toThrow(/autre personne/);
    await valeur(gerant, "select terminer_vente_en_attente($1, 'abandonner')", [attente]);
  });

  test('les ventes de chacune sont comptées séparément et le ticket Z dit qui a tenu la caisse', async () => {
    const apercuAwa = await valeur(awa, 'select apercu_cloture($1)', [caisseAwa]);
    const apercuBinta = await valeur(binta, 'select apercu_cloture($1)', [caisseBinta]);
    expect(Number(apercuAwa.total_ventes)).toBe(1000);
    expect(Number(apercuBinta.total_ventes)).toBe(500);
    expect(apercuAwa.caissier).toBe('Awa');
    expect(apercuBinta.caissier_id).toBe(binta);
  });

  test('chacune clôture SON ticket Z ; pas celui de l’autre', async () => {
    await expect(comme(binta, 'select cloturer_caisse($1, 2000)', [caisseAwa])).rejects.toThrow(/Permission refusée/);
    const zAwa = await valeur(awa, 'select cloturer_caisse($1, 2000)', [caisseAwa]);
    expect(zAwa.caissier).toBe('Awa');
    expect(Number(zAwa.total_ventes)).toBe(1000);
    expect(Number(zAwa.ecart)).toBe(0);
    // La caisse de Binta reste ouverte : elle continue à vendre.
    expect((await vendre(binta, caisseBinta, 500)).numero).toBeTruthy();
    const zBinta = await valeur(binta, 'select cloturer_caisse($1, 3000)', [caisseBinta]);
    expect(Number(zBinta.total_ventes)).toBe(1000);
    expect(zBinta.numero).not.toBe(zAwa.numero);
  });

  test('chacune ne voit que ses tickets Z ; le responsable voit tout le monde', async () => {
    const awaZ = await valeur(awa, 'select tickets_z($1)', [etab]);
    expect(awaZ.map((z) => z.caissier)).toEqual(['Awa']);
    const tous = await valeur(gerant, 'select tickets_z($1)', [etab]);
    expect(tous.map((z) => z.caissier).sort()).toEqual(['Awa', 'Binta']);
  });

  test('un responsable peut clôturer une caisse oubliée et sortir des espèces du tiroir', async () => {
    const caisse = await valeur(awa, 'select ouvrir_caisse($1, null, 500)', [etab]);
    expect((await valeur(gerant, 'select caisses_ouvertes($1)', [etab])).map((c) => c.caissier)).toEqual(['Awa']);
    expect(await valeur(binta, 'select caisses_ouvertes($1)', [etab])).toEqual([]);
    await expect(comme(binta, 'select enregistrer_depense($1, $2::jsonb)', [etab, JSON.stringify({ libelle: 'Eau', montant: 100, mode: 'especes', session_caisse_id: caisse })]))
      .rejects.toThrow();
    await valeur(gerant, 'select enregistrer_depense($1, $2::jsonb)', [etab, JSON.stringify({ libelle: 'Transport', montant: 100, mode: 'especes', session_caisse_id: caisse })]);
    const z = await valeur(gerant, 'select cloturer_caisse($1, 400)', [caisse]);
    expect(z.caissier).toBe('Awa');
    expect(Number(z.especes_attendues)).toBe(400);
  });

  test('tableau de bord : qui est en caisse, montant par personne et classement (responsable seulement)', async () => {
    await expect(comme(awa, 'select activite_caissiers($1)', [etab])).rejects.toThrow(/Accès refusé/);
    const caisse = await valeur(binta, 'select ouvrir_caisse($1, null, 0)', [etab]);
    await vendre(binta, caisse, 1500);
    const liste = await valeur(gerant, 'select activite_caissiers($1)', [etab]);
    expect(liste.map((p) => p.nom)).toEqual(['Binta', 'Awa']);
    expect(Number(liste[0].total_ventes)).toBe(2500);
    expect(liste[0].en_caisse).toBe(true);
    expect(Number(liste[0].caisse_en_cours)).toBe(1500);
    expect(liste[1].en_caisse).toBe(false);
    expect(Number(liste[1].total_ventes)).toBe(1000);
    await valeur(binta, 'select cloturer_caisse($1, 1500)', [caisse]);
  });

  test('une caisse fermée automatiquement : la caissière compte elle-même ses espèces', async () => {
    await comme(gerant, "select enregistrer_parametres_module($1, 'cloture', '{\"fermeture_automatique\": \"00:00\"}'::jsonb)", [etab]);
    const caisse = await valeur(binta, 'select ouvrir_caisse($1, null, 0)', [etab]);
    await vendre(binta, caisse, 500);
    await db.transaction(async (tx) => {
      await tx.query("set local session_replication_role = 'replica'");
      await tx.query("update sessions_caisse set ouverte_le = now() - interval '25 hours' where id = $1", [caisse]);
    });
    expect(await valeur(binta, 'select fermer_caisses_du_jour($1)', [etab])).toBe(1);
    const z = (await db.query('select id from clotures where session_caisse_id = $1', [caisse])).rows[0].id;
    await expect(comme(awa, 'select compter_cloture($1, 500)', [z])).rejects.toThrow(/Permission refusée/);
    const compte = await valeur(binta, 'select compter_cloture($1, 500)', [z]);
    expect(Number(compte.ecart)).toBe(0);
  });
});
