#!/usr/bin/env bash
# Local test runner for this session only.
# Points DATABASE_URL at the harmless 'postgres' admin DB on the same server as
# TEST_DATABASE_URL (same working credentials), purely so app startup preflight
# has something reachable to connect to without touching production. All actual
# test queries still go through TEST_DATABASE_URL / erp_test via conftest.py.
set -e
cd "$(dirname "$0")"
export DATABASE_URL=$("./venv/Scripts/python.exe" - <<'PYEOF'
import os
from dotenv import load_dotenv
from urllib.parse import urlsplit, urlunsplit
load_dotenv(".env")
u = urlsplit(os.environ["TEST_DATABASE_URL"])
print(urlunsplit(u._replace(path="/postgres")))
PYEOF
)
exec ./venv/Scripts/python.exe -m pytest "$@"
