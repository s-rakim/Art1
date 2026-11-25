from datetime import datetime
from decimal import Decimal

from django import template
from django.utils import timezone

register = template.Library()


@register.filter
def money(cents, currency: str = "") -> str:
    """1999, "GHS" -> "GHS 19.99". Amounts always come from the API in cents."""
    if cents is None or cents == "":
        return "—"
    value = Decimal(int(cents)) / 100
    text = f"{value:,.2f}"
    return f"{currency} {text}".strip()


@register.filter
def major(cents) -> str:
    """Cents to a plain number for an input box: 1999 -> "19.99"."""
    if cents is None or cents == "":
        return ""
    return f"{Decimal(int(cents)) / 100:.2f}"


@register.filter
def percent(rate) -> str:
    if rate is None or rate == "":
        return ""
    try:
        return f"{Decimal(str(rate)) * 100:.2f}".rstrip("0").rstrip(".")
    except ArithmeticError:
        return ""


@register.filter
def when(value) -> str:
    if not value:
        return "—"
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return str(value)
    if timezone.is_naive(dt):
        return dt.strftime("%d %b %Y")
    return timezone.localtime(dt).strftime("%d %b %Y, %H:%M")


@register.filter
def humanize(value) -> str:
    return str(value or "").replace("_", " ").capitalize()


@register.filter
def status_tone(status) -> str:
    s = str(status or "")
    if s in {"delivered", "active", "paid", "completed", "approved", "accepted"}:
        return "chip-success"
    if s in {"cancelled", "canceled", "failed", "rejected", "suspended", "refunded", "declined"}:
        return "chip-error"
    if s in {"pending", "pending_payment", "applicant", "draft", "awaiting_payment", "assigned", "offered", "pending_review"}:
        return "chip-warning"
    return "chip-info"


@register.simple_tag
def greeting(me) -> str:
    hour = timezone.localtime().hour
    part = "Good morning" if hour < 12 else "Good afternoon" if hour < 18 else "Good evening"
    name = (me or {}).get("first_name") or ""
    return f"{part}, {name}" if name else part


# Filled Material Design Icons, the set Nextcloud uses (Apache 2.0).
_ICONS = {
    "home": "M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z",
    "store": "M12,18H6V14H12M21,14V12L20,7H4L3,12V14H4V20H14V14H18V20H20V14M20,4H4V6H20V4Z",
    "bag": "M19,6H17A5,5 0 0,0 12,1A5,5 0 0,0 7,6H5C3.89,6 3,6.89 3,8V20A2,2 0 0,0 5,22H19A2,2 0 0,0 21,20V8C21,6.89 20.1,6 19,6M12,3A3,3 0 0,1 15,6H9A3,3 0 0,1 12,3M19,20H5V8H19V20M12,12A3,3 0 0,1 9,9H7A5,5 0 0,0 12,14A5,5 0 0,0 17,9H15A3,3 0 0,1 12,12Z",
    "receipt": "M3,22L4.5,20.5L6,22L7.5,20.5L9,22L10.5,20.5L12,22L13.5,20.5L15,22L16.5,20.5L18,22L19.5,20.5L21,22V2L19.5,3.5L18,2L16.5,3.5L15,2L13.5,3.5L12,2L10.5,3.5L9,2L7.5,3.5L6,2L4.5,3.5L3,2M18,9H6V7H18M18,13H6V11H18M18,17H6V15H18V17Z",
    "view-dashboard": "M13,3V9H21V3M13,21H21V11H13M3,21H11V15H3M3,13H11V3H3V13Z",
    "package": "M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5Z",
    "warehouse": "M6,19H8V21H6V19M12,3L2,8V21H4V13H20V21H22V8L12,3M8,11H4V9H8V11M14,11H10V9H14V11M20,11H16V9H20V11M6,15H8V17H6V15M10,15H12V17H10V15M10,19H12V21H10V19M14,19H16V21H14V19Z",
    "moped": "M19,7C19,5.89 18.1,5 17,5H14V7H17V9.65L13.5,14H10V9H6A4,4 0 0,0 2,13V16H4A3,3 0 0,0 7,19A3,3 0 0,0 10,16H14.5L19,10.35V7M7,17A1,1 0 0,1 6,16H8A1,1 0 0,1 7,17M5,6H10V8H5V6M19,13A3,3 0 0,0 16,16A3,3 0 0,0 19,19A3,3 0 0,0 22,16A3,3 0 0,0 19,13M19,17A1,1 0 0,1 18,16A1,1 0 0,1 19,15A1,1 0 0,1 20,16A1,1 0 0,1 19,17Z",
    "map": "M15,19L9,16.89V5L15,7.11M20.5,3C20.44,3 20.39,3 20.34,3L15,5.1L9,3L3.36,4.9C3.15,4.97 3,5.15 3,5.38V20.5A0.5,0.5 0 0,0 3.5,21C3.55,21 3.61,21 3.66,20.97L9,18.9L15,21L20.64,19.1C20.85,19 21,18.85 21,18.62V3.5A0.5,0.5 0 0,0 20.5,3Z",
    "cash": "M3,6H21V18H3V6M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9M7,8A2,2 0 0,1 5,10V14A2,2 0 0,1 7,16H17A2,2 0 0,1 19,14V10A2,2 0 0,1 17,8H7Z",
    "tag": "M5.5,7A1.5,1.5 0 0,1 4,5.5A1.5,1.5 0 0,1 5.5,4A1.5,1.5 0 0,1 7,5.5A1.5,1.5 0 0,1 5.5,7M21.41,11.58L12.41,2.58C12.05,2.22 11.55,2 11,2H4C2.89,2 2,2.89 2,4V11C2,11.55 2.22,12.05 2.59,12.41L11.58,21.41C11.95,21.77 12.45,22 13,22C13.55,22 14.05,21.77 14.41,21.41L21.41,14.41C21.78,14.05 22,13.55 22,13C22,12.44 21.77,11.94 21.41,11.58Z",
    "cog": "M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z",
    "account-group": "M12,5.5A3.5,3.5 0 0,1 15.5,9A3.5,3.5 0 0,1 12,12.5A3.5,3.5 0 0,1 8.5,9A3.5,3.5 0 0,1 12,5.5M5,8C5.56,8 6.08,8.15 6.53,8.42C6.38,9.85 6.8,11.27 7.66,12.38C7.16,13.34 6.16,14 5,14A3,3 0 0,1 2,11A3,3 0 0,1 5,8M19,8A3,3 0 0,1 22,11A3,3 0 0,1 19,14C17.84,14 16.84,13.34 16.34,12.38C17.2,11.27 17.62,9.85 17.47,8.42C17.92,8.15 18.44,8 19,8M5.5,18.25C5.5,16.18 8.41,14.5 12,14.5C15.59,14.5 18.5,16.18 18.5,18.25V20H5.5V18.25M0,20V18.5C0,17.11 1.89,15.94 4.45,15.6C3.86,16.28 3.5,17.22 3.5,18.25V20H0M24,20H20.5V18.25C20.5,17.22 20.14,16.28 19.55,15.6C22.11,15.94 24,17.11 24,18.5V20Z",
    "menu": "M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z",
    "logout": "M16,17V14H9V10H16V7L21,12L16,17M14,2A2,2 0 0,1 16,4V6H14V4H5V20H14V18H16V20A2,2 0 0,1 14,22H5A2,2 0 0,1 3,20V4A2,2 0 0,1 5,2H14Z",
    "magnify": "M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z",
    "image-plus": "M5,3A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H14.09C14.03,20.67 14,20.34 14,20C14,19.32 14.12,18.64 14.35,18H5L8.5,13.5L11,16.5L14.5,12L16.73,14.97C17.7,14.34 18.84,14 20,14C20.34,14 20.67,14.03 21,14.09V5A2,2 0 0,0 19,3H5M19,16V19H16V21H19V24H21V21H24V19H21V16H19Z",
    "close": "M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z",
    "arrow-left": "M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z",
    "arrow-right": "M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z",
    "delete": "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z",
    "star": "M12,17.27L18.18,21L16.54,13.64L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.64L5.82,21L12,17.27Z",
    "check": "M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z",
    "alert": "M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
    "information": "M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
    "video": "M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z",
    "heart": "M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z",
    "heart-outline": "M12.1,18.55L12,18.65L11.89,18.55C7.14,14.24 4,11.39 4,8.5C4,6.5 5.5,5 7.5,5C9.04,5 10.54,6 11.07,7.36H12.93C13.46,6 14.96,5 16.5,5C18.5,5 20,6.5 20,8.5C20,11.39 16.86,14.24 12.1,18.55M16.5,3C14.76,3 13.09,3.81 12,5.08C10.91,3.81 9.24,3 7.5,3C4.42,3 2,5.41 2,8.5C2,12.27 5.4,15.36 10.55,20.03L12,21.35L13.45,20.03C18.6,15.36 22,12.27 22,8.5C22,5.41 19.58,3 16.5,3Z",
    "download": "M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z",
    "plus": "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z",
    "shopping": "M12,13A5,5 0 0,1 7,8H9A3,3 0 0,0 12,11A3,3 0 0,0 15,8H17A5,5 0 0,1 12,13M12,3A3,3 0 0,1 15,6H9A3,3 0 0,1 12,3M19,6H17A5,5 0 0,0 12,1A5,5 0 0,0 7,6H5C3.89,6 3,6.89 3,8V20A2,2 0 0,0 5,22H19A2,2 0 0,0 21,20V8C21,6.89 20.1,6 19,6Z",
}


@register.simple_tag
def icon(name: str, size: int = 20, label: str = ""):
    from django.utils.html import format_html

    path = _ICONS.get(name, "")
    if label:
        return format_html('<svg width="{}" height="{}" viewBox="0 0 24 24" role="img" aria-label="{}"><path d="{}"/></svg>',
                           size, size, label, path)
    return format_html('<svg width="{}" height="{}" viewBox="0 0 24 24" aria-hidden="true"><path d="{}"/></svg>',
                       size, size, path)


@register.simple_tag
def sheet_cell(row: dict, column: dict) -> str:
    """One cell of a ledger sheet, formatted by the column's type."""
    value = row.get(column.get("key"))
    if value is None or value == "":
        return ""
    kind = column.get("type")
    if kind == "money":
        return money(value, row.get("currency") or "")
    if kind == "date":
        text = str(value)
        if len(text) == 10:
            try:
                return datetime.strptime(text, "%Y-%m-%d").strftime("%d %b %Y")
            except ValueError:
                return text
        return when(value)
    if kind == "number":
        try:
            return f"{value:,}" if isinstance(value, int) else f"{float(value):,.2f}"
        except (TypeError, ValueError):
            return str(value)
    return str(value)
