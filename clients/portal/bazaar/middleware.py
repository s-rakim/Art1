from django.http import HttpRequest, HttpResponse

from .auth import SESSION_KEY


class PortalMiddleware:
    """Headers every portal response gets on top of Django's own."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        # Riders share their position from the browser; nothing else may ask.
        response["Permissions-Policy"] = (
            "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()"
        )
        response["Cross-Origin-Resource-Policy"] = "same-origin"
        if hasattr(request, "session") and SESSION_KEY in request.session:
            # Signed-in pages hold personal data: never store them in a shared cache.
            response["Cache-Control"] = "no-store"
        return response
