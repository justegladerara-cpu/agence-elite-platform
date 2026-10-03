import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

let db;
let admin;
let gerant;
let caissier;
let autre;
let etab;
let autreEtab;
let article;
let session;
let vente;
let ligne;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = JSON.stringify;
const stock = async () => Number((await db.query('select sum(quantite) q from mouvements_stock where article_id=$1', [article])).rows[0].q);

beforeAll(async () => {
  db = await creerBase();
  admin = await utilisateur('admin@retours.test'); gerant = await utilisateur('gerant@retours.test');
  caissier = await utilisateur('caisse@retours.test'); autre = await utilisateur('autre@retours.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Retours Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique retours')", [client]);
  autreEtab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Autre boutique')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id,user_id,role_id) values ($1,$2,'gerant'),($1,$3,'employe'),($4,$5,'gerant')", [etab, gerant, caissier, autreEtab, autre]);
  article = await valeur(gerant, 'select enregistrer_article($1,$2::jsonb)', [etab, json({ nom: 'Chemise bleue', prix_vente: 10000, cout_achat: 6000, stock_initial: 10 })]);
  session = await valeur(caissier, 'select ouvrir_caisse($1,null,5000)', [etab]);
  const resultat = await valeur(caissier, 'select enregistrer_vente($1,$2,$3::jsonb,$4::jsonb,null,2000)', [etab, session,
    json([{ article_id: article, quantite: 3, remise: 3000 }]), json([{ mode: 'especes', montant: 25000 }])]);
  vente = resultat.vente_id;
  ligne = (await db.query('select id from lignes_vente where vente_id=$1', [vente])).rows[0].id;
});

afterAll(async () => db.close());

describe('retours partiels Commerce', () => {
  test('le caissier et un autre établissement ne peuvent pas retourner', async () => {
    const lignes = json([{ ligne_id: ligne, quantite: 1 }]);
    await expect(comme(caissier, "select enregistrer_retour_vente($1,$2::jsonb,'Taille incorrecte','especes',$3)", [vente, lignes, session])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autre, "select enregistrer_retour_vente($1,$2::jsonb,'Taille incorrecte','avoir')", [vente, lignes])).rejects.toThrow(/Permission refusée/);
  });

  test('un retour partiel applique les remises, restaure le stock et sort les espèces', async () => {
    expect(await stock()).toBe(7);
    const retour = await valeur(gerant, "select enregistrer_retour_vente($1,$2::jsonb,'Taille incorrecte','especes',$3)", [vente, json([{ ligne_id: ligne, quantite: 1 }]), session]);
    // Ligne 27 000 / 3 = 9 000, puis remise globale 2 000 / 27 000 : 8 333,33.
    expect(Number(retour.montant_retourne)).toBe(8333.33);
    expect(Number(retour.montant_rembourse)).toBe(8333.33);
    expect(await stock()).toBe(8);
    const apercu = await valeur(gerant, 'select apercu_cloture($1)', [session]);
    expect(apercu.nombre_retours).toBe(1);
    expect(Number(apercu.remboursements.especes)).toBe(8333.33);
    expect(Number(apercu.especes_attendues)).toBe(21666.67);
  });

  test('le cumul ne dépasse jamais la quantité vendue et les documents sont définitifs', async () => {
    await expect(comme(gerant, "select enregistrer_retour_vente($1,$2::jsonb,'Trop nombreux','avoir')", [vente, json([{ ligne_id: ligne, quantite: 3 }])])).rejects.toThrow(/au plus/);
    const retour = await valeur(gerant, "select enregistrer_retour_vente($1,$2::jsonb,'Échange couleur','avoir')", [vente, json([{ ligne_id: ligne, quantite: 2 }])]);
    expect(Number(retour.montant_retourne)).toBe(16666.67);
    expect(await stock()).toBe(10);
    await expect(db.query('update retours_vente set motif=$1', ['effacé'])).rejects.toThrow(/définitive/);
    await expect(db.query('delete from remboursements_vente')).rejects.toThrow(/Suppression interdite/);
  });

  test('l’historique est complet, isolé et les écritures directes sont refusées', async () => {
    const historique = await valeur(gerant, 'select historique_retours_vente($1)', [vente]);
    expect(historique).toHaveLength(2);
    expect(historique.map((r) => r.numero)).toEqual(['RET-00001', 'RET-00002']);
    await expect(comme(autre, 'select historique_retours_vente($1)', [vente])).rejects.toThrow(/introuvable/);
    expect(await comme(autre, 'select * from retours_vente where etablissement_id=$1', [etab])).toEqual([]);
    await expect(comme(gerant, "insert into retours_vente(etablissement_id,hub_id,vente_id,numero,motif,montant,cree_par) select etablissement_id,hub_id,id,'FRAUDE','Fraude',1,$2 from ventes where id=$1", [vente, gerant])).rejects.toThrow(/row-level security|permission denied/);
  });
});
