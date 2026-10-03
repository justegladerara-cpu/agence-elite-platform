// Mode local du navigateur : PGlite persisté dans IndexedDB, migrations du dépôt.
import { PGlite } from '@electric-sql/pglite';
import shim from '../../../tests/sql/supabase_shim.sql?raw';
import complement from '../../../tests/sql/supabase_shim_auth.sql?raw';
import { baseVide, listerComptesDemo, semerDemo } from './demo.js';
import { creerApiLocale, executerComme, messageErreur, optionsPGlite, preparerBase } from './moteurLocal.js';

const fichiers = import.meta.glob('../../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true });
const migrations = Object.entries(fichiers).map(([chemin, sql]) => ({ nom: chemin.split('/').pop(), sql }));
const NOM_BASE = 'idb://agence-elite-commerce';
const CLE_UTILISATEUR = 'ae-utilisateur-local';

function lireStockage(cle) {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrireStockage(cle, valeur) {
  try {
    if (valeur === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, valeur);
  } catch {
    // Stockage indisponible : la session ne survivra pas au rechargement.
  }
}

export async function demarrerLocal() {
  const db = new PGlite(NOM_BASE, optionsPGlite);
  await db.waitReady;
  await preparerBase(db, { shim, complement, migrations });
  if (await baseVide(db)) await semerDemo(db);
  let utilisateur = lireStockage(CLE_UTILISATEUR);
  const api = creerApiLocale(db, () => utilisateur);
  return {
    ...api,
    comptes: () => listerComptesDemo(db),
    utilisateur: () => utilisateur,
    async connecter(id) {
      utilisateur = id;
      ecrireStockage(CLE_UTILISATEUR, id);
    },
    // Simule l'inscription : le compte est créé à la première connexion avec cette adresse.
    async connecterParEmail(email) {
      const courriel = String(email ?? '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(courriel)) throw new Error('Adresse e-mail invalide');
      const existant = await db.query('select id from auth.users where lower(email) = $1', [courriel]);
      const id = existant.rows[0]?.id ?? (await db.query('insert into auth.users(email) values ($1) returning id', [courriel])).rows[0].id;
      utilisateur = id;
      ecrireStockage(CLE_UTILISATEUR, id);
    },
    // Même règle qu'en ligne : l'identifiant est traduit en adresse par la base, mot de passe vérifié.
    async connecterParMotDePasse(identifiant, motDePasse) {
      let email = String(identifiant ?? '').trim().toLowerCase();
      if (!email.includes('@')) {
        const resolution = await executerComme(db, null, async (tx) => (await tx.query('select public.resoudre_connexion($1, $2) r', [email, motDePasse])).rows[0].r);
        if (!resolution?.ok) throw new Error(resolution?.message ?? 'Identifiant ou mot de passe incorrect');
        email = resolution.email;
      }
      const { rows } = await db.query(
        'select id from auth.users where lower(email) = $1 and encrypted_password is not null and extensions.crypt($2, encrypted_password) = encrypted_password',
        [email, motDePasse]
      );
      if (!rows[0]) throw new Error('Identifiant ou mot de passe incorrect');
      utilisateur = rows[0].id;
      ecrireStockage(CLE_UTILISATEUR, utilisateur);
    },
    // Simule Supabase Auth : le haché change, le déclencheur de la base lève le drapeau.
    async changerMotDePasse(nouveau) {
      if (String(nouveau ?? '').length < 8) throw new Error('Mot de passe trop court ou trop simple (8 caractères au moins)');
      try {
        await db.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')) where id = $1", [utilisateur, nouveau]);
      } catch (erreur) {
        throw new Error(messageErreur(erreur));
      }
    },
    // Démonstration : aucun e-mail n'est envoyé (même réponse que le compte existe ou non).
    async demanderReinitialisation(email) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email ?? '').trim())) throw new Error('Adresse e-mail invalide');
    },
    async deconnecter() {
      utilisateur = null;
      ecrireStockage(CLE_UTILISATEUR, null);
    },
    async reinitialiser() {
      await db.close();
      await new Promise((resoudre) => {
        const requete = indexedDB.deleteDatabase('/pglite/agence-elite-commerce');
        requete.onsuccess = requete.onerror = requete.onblocked = () => resoudre();
      });
      ecrireStockage(CLE_UTILISATEUR, null);
    },
  };
}
