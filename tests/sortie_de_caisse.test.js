import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';
import { basculerPage, fonctionActive, pageEteinte, pagesCachees } from '../src/noyau/fonctions.js';

// Sortie d'argent de la caisse (migration 20261023000156, fonction sortie_de_caisse) et interrupteurs des fonctions.
// Données fictives uniquement.
let db;
let gerant;
let awa;
let binta;
let etab;
let biere;

const utilisateur = async (email, nom) => {
  const id = (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
  if (nom) await db.query('update profils set nom_complet = $2 where id = $1', [id, nom]);
  return id;
};
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const sortie = (user, session, montant, libelle = 'Carburant', categorie = 'Transport') =>
  valeur(user, 'select sortie_de_caisse($1, $2, $3, $4, $5)', [etab, session, montant, libelle, categorie]);

beforeAll(async () => {
  db = await creerBase();
  const admin = await utilisateur('admin@sortie.test');
  gerant = await utilisateur('gerant@sortie.test', 'Gérant Test');
  awa = await utilisateur('awa@sortie.test', 'Awa Test');
  binta = await utilisateur('binta@sortie.test', 'Binta Test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Sortie Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Bar Sortie Démo')", [client]);
  await db.query(
    "insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'employe')",
    [etab, gerant, awa, binta],
  );
  biere = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Bière fictive', prix_vente: 1000, suivi_stock: false })]);
});

afterAll(async () => db.close());

describe('sortie_de_caisse', () => {
  test('la caissière sort de l’argent de SA caisse : dépense en espèces, déduite au ticket Z', async () => {
    const caisse = await valeur(awa, 'select ouvrir_caisse($1, null, 5000)', [etab]);
    await valeur(awa, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb, null, 0)', [
      etab, caisse, JSON.stringify([{ article_id: biere, quantite: 3 }]), JSON.stringify([{ mode: 'especes', montant: 3000 }]),
    ]);
    const id = await sortie(awa, caisse, 2000, 'Carburant du groupe');
    const [d] = (await db.query('select * from depenses where id = $1', [id])).rows;
    expect(d.mode).toBe('especes');
    expect(d.session_caisse_id).toBe(caisse);
    expect(Number(d.montant)).toBe(2000);
    expect(d.categorie).toBe('Transport');
    expect(d.cree_par).toBe(awa);
    const z = await valeur(awa, 'select cloturer_caisse($1, 6000)', [caisse]);
    expect(Number(z.especes_attendues)).toBe(5000 + 3000 - 2000);
    expect(Number(z.ecart)).toBe(0);
  });

  test('pas sur la caisse d’une autre personne ; le gérant peut ; caisse fermée refusée ; montant et motif obligatoires', async () => {
    const caisse = await valeur(binta, 'select ouvrir_caisse($1, null, 0)', [etab]);
    await expect(sortie(awa, caisse, 1000)).rejects.toThrow(/propre caisse/);
    await expect(sortie(binta, caisse, 0)).rejects.toThrow(/combien/);
    await expect(sortie(binta, caisse, 1000, '  ')).rejects.toThrow(/pour quoi/);
    expect(await sortie(gerant, caisse, 1500, 'Technicien du frigo', 'Entretien')).toBeTruthy();
    await valeur(binta, 'select cloturer_caisse($1, 0)', [caisse]).catch(() => null);
    await expect(sortie(binta, caisse, 1000)).rejects.toThrow(/fermée|introuvable/);
  });

  test('la liste des écrans cachés s’enregistre (patron seulement, identifiants simples)', async () => {
    const schema = (await db.query("select parametres_schema from modules where id = 'etablissement'")).rows[0].parametres_schema;
    expect(schema.some((c) => c.cle === 'pages_cachees')).toBe(true);
    await comme(gerant, "select enregistrer_parametres_module($1, 'etablissement', '{\"pages_cachees\": \"emballages,preparer-commande\"}'::jsonb)", [etab]);
    const [p] = (await db.query("select data from etablissement_parametres where etablissement_id = $1 and module_id = 'etablissement'", [etab])).rows;
    expect(p.data.pages_cachees).toBe('emballages,preparer-commande');
    await expect(comme(awa, "select enregistrer_parametres_module($1, 'etablissement', '{\"pages_cachees\": \"\"}'::jsonb)", [etab])).rejects.toThrow();
    await expect(comme(gerant, "select enregistrer_parametres_module($1, 'etablissement', '{\"pages_cachees\": \"<script>\"}'::jsonb)", [etab])).rejects.toThrow();
  });
});

describe('fonctions affichées ou cachées', () => {
  test('valeurs par défaut, réglage, écrans toujours visibles, bascule', () => {
    expect(pagesCachees({})).toEqual(['happy-hour', 'reserves', 'menu-qr']);
    expect(fonctionActive({}, 'emballages')).toBe(true);
    expect(fonctionActive({}, 'happy-hour')).toBe(false);
    expect(pageEteinte({}, 'reserves')).toBe(true);
    const r = { etablissement: { pages_cachees: 'emballages, preparer-commande' } };
    expect(pageEteinte(r, 'emballages')).toBe(true);
    expect(pageEteinte(r, 'preparer-commande')).toBe(true);
    expect(pageEteinte(r, 'happy-hour')).toBe(false);
    expect(pageEteinte({ etablissement: { pages_cachees: '' } }, 'reserves')).toBe(false);
    expect(pageEteinte({ etablissement: { pages_cachees: 'parametres,accueil' } }, 'parametres')).toBe(false);
    expect(basculerPage({}, 'emballages')).toBe('happy-hour,reserves,menu-qr,emballages');
    expect(basculerPage({}, 'reserves')).toBe('happy-hour,menu-qr');
    expect(basculerPage(r, 'emballages')).toBe('preparer-commande');
  });
});
