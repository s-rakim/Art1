#!/usr/bin/env bash
# Applies supabase/migrations/*.sql in filename order, once each.
# Works against Supabase (hosted or self-hosted) or any Postgres 15+.
#
#   DATABASE_URL=postgres://... ./scripts/migrate.sh
#
# Each file runs in its own transaction together with the bookkeeping row,
# so a failed migration leaves nothing half applied.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
dir="${MIGRATIONS_DIR:-$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations}"
psql_cmd=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)

# Wait for the database when started alongside it by compose.
for i in $(seq 1 30); do
  if "${psql_cmd[@]}" -c 'select 1' >/dev/null 2>&1; then break; fi
  [ "$i" = 30 ] && { echo "database not reachable" >&2; exit 1; }
  sleep 2
done

"${psql_cmd[@]}" -c "create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now())"

applied=0
for file in "$dir"/*.sql; do
  version="$(basename "$file")"
  exists="$("${psql_cmd[@]}" -tA -c "select 1 from schema_migrations where version = '$version'")"
  if [ "$exists" = "1" ]; then
    continue
  fi
  echo "applying $version"
  "${psql_cmd[@]}" --single-transaction \
    -f "$file" \
    -c "insert into schema_migrations (version) values ('$version')"
  applied=$((applied + 1))
done

# Re-apply the lockdown so anything created since is covered by RLS and
# the function/grant revokes.
lockdown="$dir/0099_lockdown.sql"
if [ -f "$lockdown" ]; then
  "${psql_cmd[@]}" --single-transaction -f "$lockdown" >/dev/null
fi

echo "migrations done ($applied applied)"

if [ "${SEED_DEMO:-false}" = "true" ]; then
  seed="$(cd "$(dirname "$0")" && pwd)/seed_demo.sql"
  echo "loading demo data"
  "${psql_cmd[@]}" --single-transaction -f "$seed"
fi
