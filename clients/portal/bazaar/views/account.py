from __future__ import annotations

from django.contrib import messages
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_http_methods, require_POST

from .. import auth
from ..api import ApiError
from ..forms import FormError, text
from .common import problem

VEHICLES = [("motorbike", "Motorbike"), ("bicycle", "Bicycle"), ("car", "Car"), ("van", "Van"), ("on_foot", "On foot")]


def _safe_next(request: HttpRequest, fallback: str) -> str:
    nxt = request.POST.get("next") or request.GET.get("next") or ""
    if nxt and url_has_allowed_host_and_scheme(nxt, allowed_hosts={request.get_host()}, require_https=request.is_secure()):
        return nxt
    return fallback


@require_http_methods(["GET", "POST"])
def login(request: HttpRequest) -> HttpResponse:
    me = auth.current_user(request)
    if me and request.method == "GET":
        return redirect(auth.home_for(me))
    ctx: dict = {"next": request.GET.get("next", "")}
    if request.method == "POST":
        email = (request.POST.get("email") or "").strip()[:254]
        password = request.POST.get("password") or ""
        ctx.update(email=email, next=request.POST.get("next", ""))
        if not email or not password:
            ctx["error"] = "Enter your email and password."
        else:
            try:
                auth.sign_in(request, email, password)
                me = auth.current_user(request, fresh=True)
                return redirect(_safe_next(request, auth.home_for(me)))
            except (auth.AuthError, ApiError) as exc:
                ctx["error"] = str(exc)
    return render(request, "bazaar/login.html", ctx, status=400 if ctx.get("error") else 200)


@require_POST
def logout(request: HttpRequest) -> HttpResponse:
    auth.sign_out(request)
    return redirect("auth:login")


@require_http_methods(["GET", "POST"])
def signup(request: HttpRequest, as_rider: bool = False) -> HttpResponse:
    ctx: dict = {"as_rider": as_rider, "vehicles": VEHICLES, "values": request.POST}
    if request.method == "POST":
        try:
            name = text(request.POST, "full_name", required=True, max_len=120, label="Your name")
            email = text(request.POST, "email", required=True, max_len=254, label="Email")
            password = request.POST.get("password") or ""
            if len(password) < 8:
                raise FormError("password", "Use at least 8 characters.")
            rider = None
            if as_rider:
                rider = {
                    "full_name": name,
                    "phone": text(request.POST, "phone", required=True, max_len=40, label="Phone"),
                    "city": text(request.POST, "city", required=True, max_len=80, label="City"),
                    "vehicle": request.POST.get("vehicle") if request.POST.get("vehicle") in dict(VEHICLES) else "motorbike",
                    "licence_number": text(request.POST, "licence_number", max_len=60),
                }
            signed_in = auth.sign_up(request, email, password, name, "rider" if as_rider else "customer")
            if not signed_in:
                messages.success(request, "Check your inbox: open the link we sent, then sign in."
                                 + (" You'll finish the rider form after that." if rider else ""))
                return redirect("auth:login")
            if rider:
                auth.api_for(request).post("/rider/applications", rider)
            me = auth.current_user(request, fresh=True)
            return redirect(auth.home_for(me))
        except FormError as exc:
            ctx["errors"] = {exc.field: exc.message}
        except (auth.AuthError, ApiError) as exc:
            ctx["error"] = str(exc)
    return render(request, "bazaar/signup.html", ctx)
