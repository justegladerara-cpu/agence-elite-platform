#!/usr/bin/env bash
# Trouve une chaîne de connexion joignable depuis GitHub Actions.
# Les runners GitHub n'ont pas d'IPv6 : la connexion « directe »
# (db.<ref>.supabase.co) y est injoignable. Si c'est elle qui est fournie, on
# essaie le « Session pooler » du même projet (IPv4), avec les mêmes identifiants.
# Usage : scripts/url_base.sh   (lit SUPABASE_DB_URL, écrit la valeur retenue (BASE_URL)
#         dans $GITHUB_ENV si présent, sinon sur la sortie standard). Rien n'est affiché en clair.
set -euo pipefail
: "${SUPABASE_DB_URL:?}"

joignable() { PGCONNECT_TIMEOUT=8 psql "$1" -qtAc 'select 1' >/dev/null 2>&1; }

candidats() {
  node -e '
    const u = new URL(process.env.SUPABASE_DB_URL);
    console.log(u.toString());
    const m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
    if (!m) process.exit(0);
    const ref = m[1];
    const regions = (process.env.SUPABASE_REGIONS || "eu-west-3 eu-west-1 eu-west-2 eu-central-1 us-east-1 us-west-1").split(" ");
    for (const r of regions) for (const n of [0, 1]) {
      const p = new URL(u.toString());
      p.hostname = `aws-${n}-${r}.pooler.supabase.com`;
      p.port = "5432";
      p.username = `postgres.${ref}`;
      console.log(p.toString());
    }'
}

retenue=""
while IFS= read -r url; do
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::add-mask::$url"
  if joignable "$url"; then retenue="$url"; break; fi
done < <(candidats)

if [ -z "$retenue" ]; then
  echo "::error::Base injoignable avec SUPABASE_DB_URL (ni directe ni via le pooler)." >&2
  exit 1
fi
hote=$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$retenue")
echo "Base joignable via $hote" >&2
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "BASE_URL=$retenue" >> "$GITHUB_ENV"
else
  echo "$retenue"
fi
