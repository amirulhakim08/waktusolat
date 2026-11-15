#!/usr/bin/env bash
# Starts a throwaway local PostgreSQL 16 cluster for database tests.
# Usage: scripts/test-db.sh start|stop   (prints DATABASE_URL on start)
set -euo pipefail
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="${TEST_PG_DIR:-/tmp/waktusolat-testpg}"
PORT="${TEST_PG_PORT:-54329}"
RUNAS=""
if [ "$(id -u)" = "0" ]; then RUNAS="runuser -u postgres --"; fi
case "${1:-start}" in
  start)
    if [ ! -f "$DIR/PG_VERSION" ]; then
      mkdir -p "$DIR"; [ -n "$RUNAS" ] && chown postgres "$DIR"
      $RUNAS "$PGBIN/initdb" -D "$DIR" -A trust -U postgres >/dev/null
    fi
    if ! $RUNAS "$PGBIN/pg_ctl" -D "$DIR" status >/dev/null 2>&1; then
      $RUNAS "$PGBIN/pg_ctl" -D "$DIR" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DIR/log" -w start >/dev/null
    fi
    echo "postgres://postgres@127.0.0.1:$PORT/postgres"
    ;;
  stop)
    $RUNAS "$PGBIN/pg_ctl" -D "$DIR" -m fast stop >/dev/null || true
    ;;
esac
