// Mode local du navigateur : PGlite persisté dans IndexedDB, migrations du dépôt.
import { PGlite } from '@electric-sql/pglite';
import shim from '../../../tests/sql/supabase_shim.sql?raw';
import { baseVide, listerComptesDemo, semerDemo } from './demo.js';
import { creerApiLocale, optionsPGlite, preparerBase } from './moteurLocal.js';

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
  await preparerBase(db, { shim, migrations });
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
