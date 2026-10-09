// Publication des sites clients (sites-clients/*) pendant la publication Cloudflare de la plateforme.
//
// Appelé par `wrangler deploy` (champ "build.command" de wrangler.jsonc) dans Cloudflare Workers Builds, où le
// jeton de publication du compte est déjà fourni par Cloudflare (CLOUDFLARE_API_TOKEN). Ailleurs (poste local,
// CI GitHub, Cloudflare Pages, branches autres que main) : ne fait rien.
//
// Ne fait JAMAIS échouer la publication de la plateforme : toute erreur d'un site est affichée puis ignorée.
// Aucun secret n'est affiché ni enregistré.
//
// Rapport : à chaque passage dans Workers Builds, un Worker privé « sites-clients-rapport » (sans adresse
// publique) reçoit le résultat (étapes, durées, fin du journal d'erreur). Il se lit avec le connecteur
// Cloudflare (workers_get_worker_code) ou dans le tableau de bord, sans accès aux journaux de build.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const racine = join(import.meta.dirname, '..', 'sites-clients');
const env = process.env;
const branche = env.WORKERS_CI_BRANCH ?? '';
const rapport = {
  date: new Date().toISOString(),
  commit: env.WORKERS_CI_COMMIT_SHA ?? null,
  branche: branche || null,
  workersCi: env.WORKERS_CI ?? null,
  jetonPresent: Boolean(env.CLOUDFLARE_API_TOKEN),
  comptePresent: Boolean(env.CLOUDFLARE_ACCOUNT_ID),
  node: process.version,
  sites: [],
};

function journal(message) {
  console.log(`[sites-clients] ${message}`);
}

// Retire tout ce qui ressemble à un jeton avant d'enregistrer un extrait de journal.
function nettoyer(texte) {
  let t = String(texte ?? '');
  for (const cle of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) if (env[cle]) t = t.split(env[cle]).join('***');
  return t.replace(/[A-Za-z0-9_-]{32,}/g, '***').slice(-2500);
}

function doitPublier() {
  if (env.WORKERS_CI !== '1') return 'hors de Cloudflare Workers Builds';
  if (!env.CLOUDFLARE_API_TOKEN) return 'aucun jeton de publication fourni par Cloudflare';
  if (branche && branche !== 'main') return `branche ${branche} (seule main publie)`;
  return null;
}

function sites() {
  if (!existsSync(racine)) return [];
  return readdirSync(racine, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(racine, d.name))
    .filter((dossier) => {
      const paquet = join(dossier, 'package.json');
      if (!existsSync(paquet) || !existsSync(join(dossier, 'wrangler.jsonc'))) return false;
      return Boolean(JSON.parse(readFileSync(paquet, 'utf8')).scripts?.['cf:deploy']);
    });
}

// Lance une commande, affiche sa sortie dans le journal de build et garde la fin pour le rapport.
function lancer(commande, args, dossier, minutes) {
  const r = spawnSync(commande, args, {
    cwd: dossier,
    encoding: 'utf8',
    timeout: minutes * 60_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...env, NEXT_TELEMETRY_DISABLED: '1', APP_ENV: 'demo' },
  });
  const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(sortie);
  if (r.status !== 0) {
    const e = new Error(`${commande} ${args.join(' ')} : code ${r.status ?? r.signal ?? r.error?.message}`);
    e.extrait = nettoyer(sortie);
    throw e;
  }
}

function publierRapport() {
  if (!env.CLOUDFLARE_API_TOKEN) return;
  try {
    const dossier = mkdtempSync(join(tmpdir(), 'rapport-'));
    writeFileSync(
      join(dossier, 'index.js'),
      `// Rapport de publication des sites clients (aucun secret).\nexport const RAPPORT = ${JSON.stringify(rapport, null, 2)};\nexport default { fetch: () => new Response('Rapport privé', { status: 404 }) };\n`
    );
    writeFileSync(
      join(dossier, 'wrangler.json'),
      JSON.stringify({ name: 'sites-clients-rapport', main: 'index.js', compatibility_date: '2026-10-01', workers_dev: false, preview_urls: false })
    );
    const r = spawnSync('npx', ['--yes', 'wrangler@4.149.0', 'deploy', '--no-bundle'], { cwd: dossier, encoding: 'utf8', timeout: 180_000, env });
    journal(r.status === 0 ? 'rapport enregistré (Worker privé sites-clients-rapport).' : `rapport non enregistré (code ${r.status}).`);
  } catch (e) {
    journal(`rapport non enregistré (${e.message}).`);
  }
}

const raison = doitPublier();
if (raison) {
  journal(`publication ignorée : ${raison}.`);
  rapport.ignore = raison;
} else {
  for (const dossier of sites()) {
    const nom = dossier.split('/').pop();
    const debut = Date.now();
    const resultat = { nom, etape: 'installation' };
    rapport.sites.push(resultat);
    try {
      journal(`${nom} : installation des dépendances…`);
      lancer('npm', ['ci', '--no-audit', '--no-fund'], dossier, 8);
      resultat.etape = 'construction et publication';
      journal(`${nom} : construction et publication…`);
      lancer('npm', ['run', 'cf:deploy'], dossier, 12);
      resultat.etape = 'publié';
      resultat.ok = true;
      journal(`${nom} : publié en ${Math.round((Date.now() - debut) / 1000)} s.`);
    } catch (e) {
      resultat.ok = false;
      resultat.erreur = e.message;
      resultat.extrait = e.extrait ?? null;
      journal(`${nom} : ÉCHEC à l'étape « ${resultat.etape} » (${e.message}). La plateforme est publiée quand même.`);
    } finally {
      resultat.secondes = Math.round((Date.now() - debut) / 1000);
    }
  }
}
if (env.WORKERS_CI === '1') publierRapport();
process.exit(0);
