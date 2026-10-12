#!/usr/bin/env bash
# Start a throwaway local Postgres for `npm test` and `npm run e2e` (e.g. in a
# Claude Code cloud session, where nothing else provides one) and print the
# variables to use:
#   eval "$(scripts/test-db.sh)"
# Idempotent: reuses the server if it is already running. Data is disposable.
set -euo pipefail
PORT="${TEST_PG_PORT:-54329}"
DIR="${TEST_PG_DIR:-/var/tmp/markovce-rozpis-pg}"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$BIN" ] || { echo "Postgres server binaries not found (apt-get install postgresql)" >&2; exit 1; }

# initdb/pg_ctl refuse to run as root; use the postgres account then.
as_owner() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

if ! pg_isready -q -h 127.0.0.1 -p "$PORT"; then
    if [ ! -f "$DIR/data/PG_VERSION" ]; then
        mkdir -p "$DIR"
        [ "$(id -u)" = 0 ] && chown postgres "$DIR"
        as_owner "$BIN/initdb -D $DIR/data -A trust -U postgres" >/dev/null
    fi
    rm -f "$DIR/data/postmaster.pid"
    as_owner "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k /tmp' -l $DIR/log -w start" >/dev/null
fi
psql -h 127.0.0.1 -p "$PORT" -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'rozpis_test'" | grep -q 1 \
    || psql -h 127.0.0.1 -p "$PORT" -U postgres -qc "CREATE DATABASE rozpis_test"

echo "export TEST_DATABASE_URL=postgres://postgres@127.0.0.1:$PORT/rozpis_test"
echo "export E2E_DATABASE_URL=postgres://postgres@127.0.0.1:$PORT/postgres"
