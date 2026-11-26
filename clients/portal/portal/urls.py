from django.urls import include, path

from bazaar.views import errors

urlpatterns = [
    path("healthz", errors.healthz),
    path("", include("bazaar.urls")),
]

handler404 = "bazaar.views.errors.not_found"
handler500 = "bazaar.views.errors.server_error"
