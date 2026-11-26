"""Distances and rough ETAs. Straight line distance times a road factor is
crude but honest; swap in a routing engine (OSRM, Valhalla) when you have one."""

import math

ROAD_FACTOR = 1.3
SPEED_KMH = {"on_foot": 5, "bicycle": 15, "motorbike": 30, "car": 25, "van": 22}


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def eta_minutes(km: float, vehicle: str) -> int:
    speed = SPEED_KMH.get(vehicle, 20)
    return max(1, round(km * ROAD_FACTOR / speed * 60))


def point(d: dict | None) -> tuple[float, float] | None:
    if not d:
        return None
    lat, lng = d.get("lat"), d.get("lng")
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        return float(lat), float(lng)
    return None


def coarse(d: dict | None, places: int = 2) -> dict | None:
    """Rounds a point to about a kilometre, for showing a rider roughly where
    a job is before they've accepted it."""
    p = point(d)
    if p is None:
        return None
    return {"lat": round(p[0], places), "lng": round(p[1], places), "label": "Approximate area"}
