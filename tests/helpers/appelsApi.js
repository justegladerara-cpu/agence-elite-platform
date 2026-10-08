import { parse } from '@babel/parser';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { DOMAINES } from '../../src/modules/tableau_de_bord/domaines.js';

function parcourir(noeud, visiter) {
  if (!noeud || typeof noeud !== 'object') return;
  if (noeud.type) visiter(noeud);
  for (const [cle, valeur] of Object.entries(noeud)) {
    if (['loc', 'start', 'end'].includes(cle)) continue;
    if (Array.isArray(valeur)) valeur.forEach((n) => parcourir(n, visiter));
    else if (valeur && typeof valeur === 'object') parcourir(valeur, visiter);
  }
}

// Analyse le code réel, y compris les appels via executer(rpc, params).
// Un nouveau format dynamique non analysable fait échouer le contrat, au lieu d'être ignoré.
export async function listerAppelsApi(racine = 'src') {
  const resultat = [];
  async function lireDossier(dossier) {
    for (const entree of await readdir(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) { await lireDossier(chemin); continue; }
      if (!/\.(js|jsx)$/.test(entree.name)) continue;
      const source = await readFile(chemin, 'utf8');
      const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
      const noeuds = [];
      parcourir(ast, (n) => noeuds.push(n));
      const objets = new Map();
      for (const n of noeuds) {
        if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init?.type === 'ObjectExpression') {
          if (objets.has(n.id.name)) objets.set(n.id.name, null);
          else objets.set(n.id.name, n.init);
        }
      }
      const objetDe = (n) => n?.type === 'Identifier' ? objets.get(n.name) : n;
      const clesDe = (n, visites = new Set()) => {
        if (!n) return [];
        if (visites.has(n)) throw new Error(`Objet cyclique : ${chemin}`);
        const objet = objetDe(n);
        if (objet?.type !== 'ObjectExpression') throw new Error(`Paramètres non analysables : ${chemin}:${n.loc.start.line}`);
        const suivants = new Set([...visites, n]);
        return objet.properties.flatMap((p) => p.type === 'SpreadElement'
          ? clesDe(p.argument, suivants) : [p.key.name ?? p.key.value]);
      };
      const ajouter = (type, appel) => {
        const [nom, args] = appel.arguments;
        const noms = nom.type === 'StringLiteral' ? [nom.value]
          : nom.type === 'TemplateLiteral' && source.slice(nom.start, nom.end) === '`cockpit_${domaine}`'
            ? Object.keys(DOMAINES).map((d) => `cockpit_${d}`) : null;
        if (!noms) throw new Error(`Nom API non analysable : ${chemin}:${appel.loc.start.line}`);
        for (const nomApi of noms) {
          const options = objetDe(args);
          const ordre = type === 'lire' ? options?.properties.find((p) => p.key?.name === 'ordre')?.value : undefined;
          if (ordre && ordre.type !== 'ArrayExpression') throw new Error(`Tri non analysable : ${chemin}:${appel.loc.start.line}`);
          resultat.push({ fichier: relative(racine, chemin), ligne: appel.loc.start.line, type, nom: nomApi,
            parametres: type === 'rpc' ? clesDe(args) : [],
            ordre: ordre?.elements.map((e) => e.value) });
        }
      };
      for (const n of noeuds) {
        if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.object.name !== 'api') continue;
        const type = n.callee.property.name;
        if (!['rpc', 'lire'].includes(type)) continue;
        if (n.arguments[0]?.type === 'Identifier' && n.arguments[0].name === 'rpc') {
          const appels = noeuds.filter((x) => x.type === 'CallExpression' && x.callee.name === 'executer' && x.arguments[0]?.type === 'StringLiteral');
          if (!appels.length) throw new Error(`RPC dynamique sans appel résolu : ${chemin}`);
          appels.forEach((a) => ajouter(type, a));
        } else ajouter(type, n);
      }
    }
  }
  await lireDossier(racine);
  return resultat;
}
