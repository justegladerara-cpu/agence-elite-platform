import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Le patron vend sur la caisse ouverte de la caissière ; les serveurs envoient leurs commandes à la caisse
// (migration 20261023000158). Données fictives uniquement.
let db;
let patron;
let awa;
let binta;
let brice;
let etab;
let biere;

const utilisateur = async (email, nom) => {
  const id = (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
  if (nom) await db.query('update profils set nom_complet = $2 where id = $1', [id, nom]);
  return id;
};
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const vendre = (user, caisse) => valeur(user, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb, null, 0)', [
  etab, caisse, JSON.stringify([{ article_id: biere, quantite: 2 }]), JSON.stringify([{ mode: 'especes', montant: 2000 }]),
]);
const envoyer = (user, lignes, libelle = 'Table 4', session = null) =>
  valeur(user, 'select envoyer_commande_caisse($1, $2::jsonb, $3, $4)', [etab, JSON.stringify(lignes), libelle, session]);

beforeAll(async () => {
  db = await creerBase();
  const admin = await utilisateur('admin@tablette.test');
  patron = await utilisateur('patron@tablette.test', 'Patron Test');
  awa = await utilisateur('awa@tablette.test', 'Awa Test');
  binta = await utilisateur('binta@tablette.test', 'Binta Test');
  brice = await utilisateur('brice@tablette.test', 'Brice');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Tablette Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Bar Tablette Démo')", [client]);
  await db.query(
    "insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'employe'), ($1, $5, 'serveur_tablette')",
    [etab, patron, awa, binta, brice],
  );
  biere = await valeur(patron, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Bière fictive', prix_vente: 1000, suivi_stock: false })]);
});

afterAll(async () => db.close());

describe('le patron sur la caisse de la caissière', () => {
  test('la vente porte le nom du patron et compte dans le ticket Z de la caissière ; une autre caissière est refusée', async () => {
    const caisse = await valeur(awa, 'select ouvrir_caisse($1, null, 0)', [etab]);
    const v = await vendre(patron, caisse);
    const [vente] = (await db.query('select vendeur, session_caisse_id from ventes where id = $1', [v.vente_id])).rows;
    expect(vente.vendeur).toBe(patron);
    expect(vente.session_caisse_id).toBe(caisse);
    const i = await valeur(patron, 'select infos_vente($1)', [v.vente_id]);
    expect(i.vendu_par_autre).toBe(true);
    expect(i.caissier).toBe('Patron Test');
    expect(i.caisse_tenue_par).toBe('Awa Test');
    await expect(vendre(binta, caisse)).rejects.toThrow(/autre personne/);
    const z = await valeur(awa, 'select cloturer_caisse($1, 2000)', [caisse]);
    expect(Number(z.especes_attendues)).toBe(2000);
  });
});

describe('tablette du serveur', () => {
  test('sans caisse ouverte : message clair ; le serveur ne peut pas ouvrir de caisse', async () => {
    await expect(envoyer(brice, [{ article_id: biere, quantite: 1 }])).rejects.toThrow(/Aucune caisse/);
    await expect(valeur(brice, 'select ouvrir_caisse($1, null, 0)', [etab])).rejects.toThrow();
  });

  test('la commande arrive dans les factures en cours de la caisse, avec le prénom du serveur', async () => {
    const caisse = await valeur(awa, 'select ouvrir_caisse($1, null, 0)', [etab]);
    expect((await valeur(brice, 'select caisses_pour_commande($1)', [etab])).map((c) => c.caissier)).toEqual(['Awa Test']);
    const r = await envoyer(brice, [{ article_id: biere, quantite: 3 }]);
    expect(r.libelle).toBe('Table 4 · Brice');
    expect(Number(r.total)).toBe(3000);
    expect(r.caissier).toBe('Awa Test');
    const attente = await comme(awa, 'select * from ventes_en_attente where id = $1', [r.id]);
    expect(attente).toHaveLength(1);
    expect(attente[0].session_caisse_id).toBe(caisse);
    expect(attente[0].cree_par).toBe(brice);
    const [s] = (await db.query('select prenom from serveurs_caisse where id = $1', [attente[0].serveur_id])).rows;
    expect(s.prenom).toBe('Brice');
    const mes = await valeur(brice, 'select mes_commandes_envoyees($1)', [etab]);
    expect(mes[0].statut).toBe('en_attente');
    expect(mes[0].articles).toEqual([{ nom: 'Bière fictive', quantite: 3 }]);
    // Le serveur ne lit pas directement les factures en cours ni n'écrit sur la caisse en dehors de l'envoi.
    expect(await comme(brice, 'select * from ventes_en_attente')).toHaveLength(0);
    const [sc] = (await db.query('select hub_id from sessions_caisse where id = $1', [caisse])).rows;
    await expect(comme(brice, "insert into ventes_en_attente(etablissement_id, hub_id, session_caisse_id, libelle, lignes, cree_par) values ($1, $2, $3, 'x', $4::jsonb, $5)",
      [etab, sc.hub_id, caisse, JSON.stringify([{ article_id: biere, quantite: 1 }]), brice])).rejects.toThrow();
    // La caissière reprend et encaisse comme d'habitude.
    await valeur(awa, "select terminer_vente_en_attente($1, 'reprendre')", [r.id]);
    expect((await valeur(brice, 'select mes_commandes_envoyees($1)', [etab]))[0].statut).toBe('reprise');
  });

  test('commande vide, article inconnu, quantité folle : refusés ; une caissière ne peut pas envoyer sur la caisse d’une autre par ce chemin sans le droit', async () => {
    await expect(envoyer(brice, [])).rejects.toThrow(/vide/);
    await expect(envoyer(brice, [{ article_id: '00000000-0000-0000-0000-000000000000', quantite: 1 }])).rejects.toThrow(/n'existe plus|n’existe plus/);
    await expect(envoyer(brice, [{ article_id: biere, quantite: 0 }])).rejects.toThrow();
    const [{ count }] = (await db.query("select count(*)::int as count from ventes_en_attente where cree_par = $1", [brice])).rows;
    expect(count).toBe(1);
  });

  test('deux caisses ouvertes : il faut choisir la caisse', async () => {
    const autre = (await db.query("select id from sessions_caisse where statut = 'ouverte'")).rows;
    expect(autre).toHaveLength(1);
    await db.query("insert into points_de_vente(etablissement_id, hub_id, nom) select etablissement_id, hub_id, 'Terrasse' from sessions_caisse where id = $1", [autre[0].id]);
    const pdv = (await db.query("select id from points_de_vente where nom = 'Terrasse'")).rows[0].id;
    const deuxieme = await valeur(binta, 'select ouvrir_caisse($1, $2, 0)', [etab, pdv]);
    await expect(envoyer(brice, [{ article_id: biere, quantite: 1 }])).rejects.toThrow(/choisissez la caisse/);
    const r = await envoyer(brice, [{ article_id: biere, quantite: 1 }], 'Terrasse 2', deuxieme);
    expect(r.caissier).toBe('Binta Test');
  });
});

describe('panier du serveur', () => {
  test('ajouter, plus, moins, total, lignes envoyées', async () => {
    const { ajouterArticle, changerQuantite, lignesAEnvoyer, totalCommande } = await import('../src/modules/caisse/prendreCommande.js');
    let l = ajouterArticle([], 'a');
    l = ajouterArticle(l, 'b');
    l = ajouterArticle(l, 'a');
    expect(l).toEqual([{ article_id: 'a', quantite: 2 }, { article_id: 'b', quantite: 1 }]);
    l = changerQuantite(l, 'b', -1);
    expect(l).toEqual([{ article_id: 'a', quantite: 2 }]);
    expect(totalCommande(l, { a: { prix_vente: 1500 } })).toBe(3000);
    expect(lignesAEnvoyer(l)).toEqual([{ article_id: 'a', quantite: 2 }]);
  });
});
