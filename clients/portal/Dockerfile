# The Bazaar's Django portal. Build from the repository root's compose file:
# it passes the Next.js app in as the "frontend" context so the portal is
# styled from the same tokens, logo and wallpaper (see clients/brand).

FROM python:3.13-slim AS deps
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt /tmp/requirements.txt
RUN python -m venv /venv && /venv/bin/pip install -r /tmp/requirements.txt

FROM python:3.13-slim AS brand
COPY --from=brandkit . /kit/
COPY --from=frontend src/app/globals.css /fe/src/app/globals.css
COPY --from=frontend public/img /fe/public/img
RUN python -I /kit/build_brand.py /fe /brand

FROM python:3.13-slim
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home /app --shell /usr/sbin/nologin app
ENV PATH=/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORTAL_BRAND_DIR=/app/brand
COPY --from=deps /venv /venv
WORKDIR /app
COPY --chown=root:root manage.py ./
COPY --chown=root:root portal ./portal
COPY --chown=root:root bazaar ./bazaar
COPY --from=brand --chown=root:root /brand ./brand
RUN PORTAL_BUILD=1 python manage.py collectstatic --noinput -v 0 \
 && rm -rf bazaar/tests portal/test_settings.py

USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,sys; r=urllib.request.Request('http://127.0.0.1:8000/healthz', headers={'Host': 'portal'}); sys.exit(0 if urllib.request.urlopen(r, timeout=3).status == 200 else 1)"
CMD ["sh", "-c", "exec gunicorn portal.wsgi --no-control-socket --bind 0.0.0.0:8000 --workers ${PORTAL_WORKERS:-2} --threads 4 --worker-tmp-dir /tmp --timeout 120 --graceful-timeout 20 --max-requests 2000 --max-requests-jitter 200 --access-logfile - --limit-request-line 4094"]
