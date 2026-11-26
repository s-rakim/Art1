from django.conf import settings
from django.http import HttpRequest

from .auth import ME_KEY, ROLE_HOME


def portal(request: HttpRequest) -> dict:
    cached = request.session.get(ME_KEY) if hasattr(request, "session") else None
    me = getattr(request, "me", None) or (cached or {}).get("me")
    return {
        "store_name": settings.STORE_NAME,
        "shop_url": settings.SHOP_URL,
        "hub_url": settings.HUB_URL,
        "me": me,
        "bag_count": request.session.get("bag_count") if hasattr(request, "session") else None,
        "role_home": ROLE_HOME.get(me["role"]) if me else None,
        "map_center": settings.MAP_CENTER,
        "map_tiles": settings.MAP_TILES,
        "map_attribution": settings.MAP_ATTRIBUTION,
    }
