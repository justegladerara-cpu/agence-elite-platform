import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { creerBase } from './helpers/db.js';
let db, user, client, etab;
beforeAll(async () => {
  db = await creerBase();
  user = (await db.query("insert into auth.users(email) values('a@test.test') returning id")).rows[0].id;
  client = (await db.query("insert into clients(nom) values('A') returning id")).rows[0].id;
  etab = (await db.query("insert into etablissements(client_id,solution_id,nom) values($1,'commerce','A') returning id", [client])).rows[0].id;
}); afterAll(async () => db.close());

describe('contraintes métier du modèle', () => {
  test.each([['clients',"nom,statut", "'X','invalide'"],['etablissements',"client_id,solution_id,nom,statut",`'${client}','commerce','X','invalide'`],['solutions','id,nom,statut',"'x','X','invalide'"],['modules','id,nom,nature,statut',"'x','X','socle','invalide'"]])('statut invalide refusé sur %s', async (table, cols, vals) => expect(db.exec(`insert into ${table}(${cols}) values(${vals})`)).rejects.toThrow());
  test('module proposé accepté et hors solution refusé', async () => {
    await expect(db.query("insert into etablissement_modules(etablissement_id,module_id) values($1,'etablissement')", [etab])).resolves.toBeTruthy();
    await db.exec("insert into modules(id,nom,nature,statut) values('hors_solution','Hors','socle','actif')");
    await expect(db.query("insert into etablissement_modules(etablissement_id,module_id) values($1,'hors_solution')", [etab])).rejects.toThrow(/pas proposé/);
  });
  test('rattachement de l’établissement immuable', async () => expect(db.query("update etablissements set solution_id='hotel' where id=$1", [etab])).rejects.toThrow(/ne peuvent pas/));
  test.each([[null,null],[client,'gerant']])('invitation avec cible invalide refusée', async (cible, roleClient) => expect(db.query('insert into invitations(email,etablissement_id,role_id,client_id,role_client,cree_par) values($1,$2,$3,$4,$5,$6)', ['x@test.test',etab,'gerant',cible,roleClient,user])).rejects.toThrow());
  test('email majuscule et doublon en attente refusés', async () => {
    await expect(db.query('insert into invitations(email,etablissement_id,role_id,cree_par) values($1,$2,$3,$4)', ['X@test.test',etab,'gerant',user])).rejects.toThrow();
    await db.query('insert into invitations(email,etablissement_id,role_id,cree_par) values($1,$2,$3,$4)', ['x@test.test',etab,'gerant',user]);
    await expect(db.query('insert into invitations(email,etablissement_id,role_id,cree_par) values($1,$2,$3,$4)', ['x@test.test',etab,'lecteur',user])).rejects.toThrow();
  });
  test('objets JSON et préfixe de permission vérifiés', async () => {
    await expect(db.query("insert into etablissement_membres values($1,$2,'gerant','[]')", [etab,user])).rejects.toThrow();
    await expect(db.exec("insert into permissions(id,module_id) values('membres.incorrect','etablissement')")).rejects.toThrow();
  });
  test('journaux immuables', async () => {
    const id = (await db.query("insert into evenements(type) values('test') returning id")).rows[0].id;
    await expect(db.query('update evenements set type=$1 where id=$2',['x',id])).rejects.toThrow(/ajout seul/);
    await expect(db.query('delete from evenements where id=$1',[id])).rejects.toThrow(/ajout seul/);
    const audit = (await db.query("insert into journal_audit(table_nom,operation) values('x','INSERT') returning id")).rows[0].id;
    await expect(db.query('update journal_audit set table_nom=$1 where id=$2',['y',audit])).rejects.toThrow(/ajout seul/);
    await expect(db.query('delete from journal_audit where id=$1',[audit])).rejects.toThrow(/ajout seul/);
  });
  test('modifie_le évolue et couleur invalide refusée', async () => {
    const avant=(await db.query('select modifie_le from clients where id=$1',[client])).rows[0].modifie_le;
    await new Promise((r)=>setTimeout(r,10)); await db.query("update clients set nom='B' where id=$1",[client]);
    expect((await db.query('select modifie_le from clients where id=$1',[client])).rows[0].modifie_le.getTime()).toBeGreaterThan(avant.getTime());
    await expect(db.query("insert into etablissement_identite(etablissement_id,couleur_principale) values($1,'rouge')",[etab])).rejects.toThrow();
  });
});
