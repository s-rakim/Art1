"""Settings for the test suite: fixed fake endpoints, no Redis, no secrets."""

import os

os.environ.update({
    "PORTAL_TESTING": "1",
    "PORTAL_PREFIX": "/",
    "SUPABASE_URL": "https://auth.test",
    "SUPABASE_ANON_KEY": "anon-test-key",
    "API_URL_INTERNAL": "http://api.test/api/v1",
    "PORTAL_REDIS_URL": "",
})

from .settings import *  # noqa: E402,F403
