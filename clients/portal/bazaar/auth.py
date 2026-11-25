"""Sign-in for the portal, through the same Supabase project as the shop.

The browser only ever holds a random session cookie. The Supabase access and
refresh tokens stay in the server-side session (Redis) and are refreshed here
when they get close to expiring. Roles are never taken from the token: they
come from GET /me on the API, which reads its own profiles table.
"""

from __future__ import annotations

import hashlib
import logging
import time
from functools import wraps
from typing import Any, Callable

import httpx
from django.conf import settings
from django.core.cache import cache
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.urls import reverse

from .api import Api, ApiError

log = logging.getLogger("portal.auth")

SESSION_KEY = "bazaar_auth"
ME_KEY = "bazaar_me"
ME_TTL = 60  # seconds before the role is checked with the API again

# Which pages each role may open. "seller" is the API's word for a vendor.
ROLE_HOME = {
    "customer": "shop:home",
    "seller": "vendor:dashboard",
    "rider": "rider:dashboard",
    "rider_applicant": "rider:pending",
    "admin": "console:dashboard",
}

LOGIN_LIMIT = 8  # attempts per 10 minutes, per address and per email


class AuthError(Exception):
    pass


_http: httpx.Client | None = None


def _auth_http() -> httpx.Client:
    global _http
    if _http is None:
        _http = httpx.Client(timeout=10, follow_redirects=False, headers={"User-Agent": "bazaar-portal"})
    return _http


def _gotrue(path: str, body: dict, token: str | None = None) -> dict:
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise AuthError("Sign-in isn't set up on this server yet.")
    headers = {"apikey": settings.SUPABASE_ANON_KEY, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        resp = _auth_http().post(f"{settings.SUPABASE_URL}/auth/v1{path}", json=body, headers=headers)
    except httpx.HTTPError:
        raise AuthError("Sign-in is unavailable right now. Try again in a minute.") from None
    if resp.status_code >= 400:
        try:
            data = resp.json()
        except ValueError:
            data = {}
        code = str(data.get("error_code") or data.get("error") or "")
        if code in {"invalid_grant", "invalid_credentials"} or resp.status_code == 400 and path.startswith("/token"):
            raise AuthError("That email and password don't match an account.")
        if code == "email_not_confirmed":
            raise AuthError("Confirm your email first: open the link we sent you, then sign in.")
        if code in {"user_already_exists", "email_exists"}:
            raise AuthError("There's already an account with that email. Sign in instead.")
        if code == "weak_password":
            raise AuthError("Pick a longer password: at least 8 characters, not a common one.")
        if resp.status_code == 429:
            raise AuthError("Too many attempts. Wait a few minutes and try again.")
        log.warning("auth %s -> %s %s", path.split("?")[0], resp.status_code, code)
        raise AuthError("We couldn't sign you in. Try again.")
    if not resp.content:
        return {}
    try:
        return resp.json()
    except ValueError:
        raise AuthError("Sign-in sent back something unexpected. Try again.") from None


def _store(request: HttpRequest, data: dict) -> None:
    request.session[SESSION_KEY] = {
        "access": data["access_token"],
        "refresh": data["refresh_token"],
        "expires_at": int(data.get("expires_at") or time.time() + int(data.get("expires_in", 3600))),
        "user_id": (data.get("user") or {}).get("id"),
    }
    request.session.pop(ME_KEY, None)


def client_ip(request: HttpRequest) -> str:
    # Caddy replaces X-Forwarded-For with the real address (it trusts no
    # incoming value), so the last entry is the visitor.
    fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return (fwd.split(",")[-1].strip() if fwd else "") or request.META.get("REMOTE_ADDR", "")


def _throttle(request: HttpRequest, email: str) -> None:
    keys = [
        "login:ip:" + client_ip(request),
        "login:email:" + hashlib.sha256(email.lower().encode()).hexdigest()[:32],
    ]
    for key in keys:
        cache.add(key, 0, timeout=600)
        try:
            n = cache.incr(key)
        except ValueError:
            n = 1
        if n > LOGIN_LIMIT:
            raise AuthError("Too many attempts. Wait ten minutes and try again.")


def sign_in(request: HttpRequest, email: str, password: str) -> None:
    _throttle(request, email)
    data = _gotrue("/token?grant_type=password", {"email": email, "password": password})
    # New session key on sign-in so a key planted before login is useless.
    request.session.cycle_key()
    _store(request, data)


def sign_up(request: HttpRequest, email: str, password: str, full_name: str, signup_as: str) -> bool:
    """Returns True if the person is signed in now, False if they must confirm
    their email first."""
    _throttle(request, email)
    data = _gotrue("/signup", {
        "email": email,
        "password": password,
        "data": {"full_name": full_name, "signup_as": signup_as},
    })
    if data.get("access_token"):
        request.session.cycle_key()
        _store(request, data)
        return True
    return False


def sign_out(request: HttpRequest) -> None:
    auth = request.session.get(SESSION_KEY)
    if auth:
        try:
            _gotrue("/logout?scope=local", {}, token=auth["access"])
        except AuthError:
            pass
    request.session.flush()


def access_token(request: HttpRequest) -> str | None:
    auth = request.session.get(SESSION_KEY)
    if not auth:
        return None
    if auth["expires_at"] - 60 > time.time():
        return auth["access"]
    try:
        data = _gotrue("/token?grant_type=refresh_token", {"refresh_token": auth["refresh"]})
    except AuthError:
        request.session.flush()
        return None
    _store(request, data)
    return data["access_token"]


def api_for(request: HttpRequest) -> Api:
    return Api(access_token(request), client_ip(request))


def current_user(request: HttpRequest, fresh: bool = False) -> dict | None:
    """The signed-in person as the API sees them, cached for a minute."""
    if SESSION_KEY not in request.session:
        return None
    cached = request.session.get(ME_KEY)
    if cached and not fresh and cached["at"] + ME_TTL > time.time():
        return cached["me"]
    token = access_token(request)
    if not token:
        return None
    try:
        me = Api(token, client_ip(request)).me()
    except ApiError as exc:
        if exc.status == 401:
            request.session.flush()
            return None
        raise
    request.session[ME_KEY] = {"me": me, "at": time.time()}
    return me


def home_for(me: dict | None) -> str:
    if not me:
        return reverse("shop:home")
    return reverse(ROLE_HOME.get(me["role"], "shop:home"))


def role_required(*roles: str) -> Callable:
    """Only people whose API role is in `roles` get through. Everyone else is
    sent to sign in, or to their own home page. The API checks again on
    every call, so this is about showing the right pages, not the only lock."""

    def deco(view: Callable) -> Callable:
        @wraps(view)
        def wrapped(request: HttpRequest, *args: Any, **kwargs: Any) -> HttpResponse:
            me = current_user(request, fresh=request.method != "GET")
            if me is None:
                if request.headers.get("HX-Request"):
                    resp = HttpResponse(status=401)
                    resp["HX-Redirect"] = reverse("auth:login")
                    return resp
                return redirect(f"{reverse('auth:login')}?next={request.get_full_path()}")
            if roles and me["role"] not in roles:
                if request.headers.get("HX-Request") or request.method != "GET":
                    return HttpResponse("You don't have access to that.", status=403)
                return redirect(home_for(me))
            request.me = me
            return view(request, *args, **kwargs)

        wrapped.roles = roles  # type: ignore[attr-defined]
        return wrapped

    return deco
