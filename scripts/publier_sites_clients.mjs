// Publication des sites clients (sites-clients/*) pendant la publication Cloudflare de la plateforme.
//
// Appelé par `wrangler deploy` (champ "build.command" de wrangler.jsonc) dans Cloudflare Workers Builds, où le
// jeton de publication du compte est déjà fourni par Cloudflare (CLOUDFLARE_API_TOKEN). Ailleurs (poste local,
// CI GitHub, Cloudflare Pages, branches autres que main) : ne fait rien.
//
// Ne fait JAMAIS échouer la publication de la plateforme : toute erreur d'un site est affichée puis ignorée.
// Aucun secret n'est affiché.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const racine = join(import.meta.dirname, '..', 'sites-clients');
const env = process.env;
const branche = env.WORKERS_CI_BRANCH ?? '';

function journal(message) {
  console.log(`[sites-clients] ${message}`);
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

function lancer(commande, args, dossier, minutes) {
  execFileSync(commande, args, {
    cwd: dossier,
    stdio: 'inherit',
    timeout: minutes * 60_000,
    env: { ...env, NEXT_TELEMETRY_DISABLED: '1', APP_ENV: 'demo' },
  });
}

const raison = doitPublier();
if (raison) {
  journal(`publication ignorée : ${raison}.`);
} else {
  for (const dossier of sites()) {
    const nom = dossier.split('/').pop();
    const debut = Date.now();
    try {
      journal(`${nom} : installation des dépendances…`);
      lancer('npm', ['ci', '--no-audit', '--no-fund'], dossier, 8);
      journal(`${nom} : construction et publication…`);
      lancer('npm', ['run', 'cf:deploy'], dossier, 12);
      journal(`${nom} : publié en ${Math.round((Date.now() - debut) / 1000)} s.`);
    } catch (e) {
      journal(`${nom} : ÉCHEC (${e.message.split('\n')[0]}). La plateforme est publiée quand même.`);
    }
  }
}
process.exit(0);
