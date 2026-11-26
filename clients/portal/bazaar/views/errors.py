from django.http import HttpRequest, HttpResponse
from django.shortcuts import render


def csrf_failure(request: HttpRequest, reason: str = "") -> HttpResponse:
    return render(request, "bazaar/error.html", {
        "title": "That form expired",
        "message": "For your safety the page needs to be reloaded before you send it again.",
    }, status=403)


def not_found(request: HttpRequest, exception=None) -> HttpResponse:
    return render(request, "bazaar/error.html", {
        "title": "Page not found", "message": "That page doesn't exist or has moved.",
    }, status=404)


def server_error(request: HttpRequest) -> HttpResponse:
    return render(request, "bazaar/error.html", {
        "title": "Something broke", "message": "We couldn't load this page. Try again in a moment.",
    }, status=500)


def healthz(request: HttpRequest) -> HttpResponse:
    return HttpResponse("ok", content_type="text/plain")
