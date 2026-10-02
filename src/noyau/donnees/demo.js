// Données de démonstration fictives pour le mode local. Aucune donnée réelle.
// Le contenu vient de supabase/demo/commerce_demo.sql puis modules_demo.sql, les mêmes scripts qu'en production.
import scriptDemo from '../../../supabase/demo/commerce_demo.sql?raw';
import scriptModules from '../../../supabase/demo/modules_demo.sql?raw';

// Mot de passe temporaire des comptes de démonstration locaux (changement obligatoire à la connexion).
export const MOT_DE_PASSE_DEMO_LOCAL = '1234';

export async function baseVide(db) {
  return (await db.query('select count(*)::int n from public.clients')).rows[0].n === 0;
}

export async function semerDemo(db, script = scriptDemo, modules = scriptModules) {
  // Super administrateur local (en ligne, c'est le compte existant d'Agence Elite).
  const sa = (await db.query("insert into auth.users(email) values ('editeur@demo.local') returning id")).rows[0].id;
  await db.query("update public.profils set nom_complet = 'Juste Glade' where id = $1", [sa]);
  await db.query("insert into public.plateforme_admins(user_id, role) values ($1, 'super_admin')", [sa]);
  await db.transaction(async (tx) => {
    await tx.query("select set_config('app.demo_mot_de_passe', $1, true), set_config('app.demo_super_admin_email', 'editeur@demo.local', true)", [MOT_DE_PASSE_DEMO_LOCAL]);
    await tx.exec(script);
    if (modules) await tx.exec(modules);
  });
  const etablissement = (await db.query("select id from public.etablissements where nom = 'Commerce Démo'")).rows[0].id;
  return { etablissements: [etablissement], superAdmin: sa };
}

export async function listerComptesDemo(db) {
  return (await db.query(
    `select u.id, u.email, p.nom_complet as nom, c.identifiant
     from auth.users u
     left join public.profils p on p.id = u.id
     left join public.comptes_connexion c on c.user_id = u.id
     where u.email like '%@demo.local' or u.email like '%@demo.agence-elite.fr' or u.email like '%@identifiants.agence-elite.fr'
     order by c.identifiant is null, u.email = 'editeur@demo.local' desc, c.identifiant, u.email`
  )).rows;
}
