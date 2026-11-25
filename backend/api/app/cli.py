"""Operator commands, run inside the api container:

    python -m app.cli make-admin someone@example.com
    python -m app.cli export-openapi > openapi.json
    python -m app.cli register-mpesa-urls

There is deliberately no public way to become an admin. The first admin is
made here, by someone with shell access to the server; after that admins can
promote others from the admin API. The person signs up on the site first, as
an ordinary shopper.
"""

import asyncio
import json
import sys

import asyncpg

from .config import get_settings


async def make_admin(email: str) -> int:
    settings = get_settings()
    conn = await asyncpg.connect(settings.database_url, statement_cache_size=0)
    try:
        uid = await conn.fetchval("select id from profiles where lower(email) = lower($1)", email)
        if uid is None and await conn.fetchval("select to_regclass('auth.users') is not null"):
            # Signed up but hasn't opened a page since: take the account
            # straight from Supabase Auth.
            user = await conn.fetchrow(
                """select id, email, raw_user_meta_data->>'full_name' as full_name
                     from auth.users where lower(email) = lower($1) and deleted_at is null""",
                email,
            )
            if user is not None:
                await conn.execute(
                    "insert into profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing",
                    user["id"], user["email"], user["full_name"],
                )
                uid = user["id"]
        if uid is None:
            print(f"No account for {email}. Sign up on the site with that address first.")
            return 1
        await conn.execute("update profiles set role = 'admin' where id = $1", uid)
    finally:
        await conn.close()
    from .supabase_admin import sync_app_roles

    await sync_app_roles(settings, uid, "admin")
    print(f"{email} is now an admin.")
    return 0


def export_openapi() -> int:
    from .main import app, export_openapi as export

    json.dump(export(app), sys.stdout, indent=2, sort_keys=False)
    sys.stdout.write("\n")
    return 0


async def register_mpesa_urls() -> int:
    """Tell Daraja where to post the till's payments (C2B). Needs
    MPESA_SHORTCODE, MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET,
    PAYMENT_WEBHOOK_TOKEN and PUBLIC_API_URL."""
    import httpx

    from .config import get_settings

    s = get_settings()
    missing = [n for n, v in (("MPESA_SHORTCODE", s.mpesa_shortcode), ("MPESA_CONSUMER_KEY", s.mpesa_consumer_key),
                              ("MPESA_CONSUMER_SECRET", s.mpesa_consumer_secret),
                              ("PAYMENT_WEBHOOK_TOKEN", s.payment_webhook_token),
                              ("PUBLIC_API_URL", s.public_api_url)) if not v]
    if missing:
        print("missing: " + ", ".join(missing), file=sys.stderr)
        return 1
    base = "https://api.safaricom.co.ke" if s.mpesa_env == "production" else "https://sandbox.safaricom.co.ke"
    hook = f"{s.public_api_url.rstrip('/')}/payments/till/{s.payment_webhook_token}"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{base}/oauth/v1/generate", params={"grant_type": "client_credentials"},
                             auth=(s.mpesa_consumer_key, s.mpesa_consumer_secret))
        if r.status_code != 200:
            print(f"Daraja sign-in failed: HTTP {r.status_code}", file=sys.stderr)
            return 1
        token = r.json().get("access_token")
        r = await client.post(
            f"{base}/mpesa/c2b/v2/registerurl",
            headers={"Authorization": f"Bearer {token}"},
            json={"ShortCode": s.mpesa_shortcode, "ResponseType": "Completed",
                  "ConfirmationURL": f"{hook}/confirmation", "ValidationURL": f"{hook}/validation"},
        )
    print(f"HTTP {r.status_code}: {r.text[:500]}")
    return 0 if r.status_code == 200 else 1


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[0] == "make-admin":
        return asyncio.run(make_admin(argv[1]))
    if argv == ["export-openapi"]:
        return export_openapi()
    if argv == ["register-mpesa-urls"]:
        return asyncio.run(register_mpesa_urls())
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
