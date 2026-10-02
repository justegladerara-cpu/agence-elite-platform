#!/usr/bin/env bash
# Vérifie de bout en bout qu'une base se sauvegarde et se restaure à l'identique :
# export de la base source, démarrage d'une base Supabase vierge (Docker),
# restauration, puis comparaison du nombre de lignes de chaque table.
# Usage : scripts/verifier_restauration.sh "<url de la base source>"
# SUPABASE_CLI choisit la CLI qui démarre la base vierge (par défaut celle du
# dépôt). Pour la production, prendre la plus récente : la base vierge doit
# avoir le même schéma « auth » que le projet hébergé, tenu à jour par Supabase.
set -euo pipefail
source_url="$1"
racine="$(cd "$(dirname "$0")/.." && pwd)"
travail="$(mktemp -d)"
cli=${SUPABASE_CLI:-npx supabase}
trap '$cli stop --workdir "$travail/cible" --no-backup >/dev/null 2>&1 || true; rm -rf "$travail"' EXIT

"$racine/scripts/sauvegarder.sh" "$source_url" "$travail/sauvegarde"

mkdir -p "$travail/cible/supabase"
sed -e 's/^project_id = .*/project_id = "verification-restauration"/' \
    -e 's/= 5432\([0-9]\)/= 5532\1/' \
    "$racine/supabase/config.toml" > "$travail/cible/supabase/config.toml"
$cli db start --workdir "$travail/cible"
cible_url="postgresql://postgres:postgres@127.0.0.1:55322/postgres"

"$racine/scripts/restaurer.sh" "$travail/sauvegarde" "$cible_url"

requete="select string_agg(format('%s.%s=%s', schemaname, relname, n), ' ' order by schemaname, relname) from (
  select t.schemaname, t.tablename relname,
    (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I.%I', t.schemaname, t.tablename), false, true, '')))[1]::text n
  from pg_tables t where t.schemaname in ('public', 'auth') and t.tablename not like 'schema_migrations%'
) x"
avant="$(psql "$source_url" -At -c "$requete" | tr ' ' '\n')"
apres="$(psql "$cible_url" -At -c "$requete" | tr ' ' '\n')"
if [ "$avant" != "$apres" ]; then
  echo "::error::La base restaurée diffère de la source :"
  diff <(echo "$avant") <(echo "$apres") || true
  exit 1
fi
echo "$avant" | grep -E '^public\.(clients|etablissements|licences|ventes|paiements|mouvements_stock|clotures|journal_audit)=|^auth\.users='
echo "Restauration vérifiée : $(echo "$avant" | wc -l) tables identiques."
