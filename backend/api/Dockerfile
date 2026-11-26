# syntax=docker/dockerfile:1.7
# Marketplace API, background worker and migration runner in one image.
# Builds natively for linux/amd64 and linux/arm64 (Oracle Ampere).

FROM python:3.12-slim-bookworm AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /venv
COPY api/requirements.txt /tmp/requirements.txt
RUN /venv/bin/pip install --upgrade pip && /venv/bin/pip install -r /tmp/requirements.txt

FROM python:3.12-slim-bookworm
# psql for the migration runner; tini to reap processes and pass signals.
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home /app --shell /usr/sbin/nologin app

ENV PATH=/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WEB_CONCURRENCY=2

COPY --from=build /venv /venv
WORKDIR /app
COPY --chown=root:root api/app ./app
COPY --chown=root:root supabase/migrations ./supabase/migrations
COPY --chown=root:root scripts/migrate.sh scripts/seed_demo.sql ./scripts/
RUN chmod 0755 scripts/migrate.sh

USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3).status == 200 else 1)"

ENTRYPOINT ["/usr/bin/tini", "--"]
# --proxy-headers so rate limits see the real client IP from Caddy. Only
# safe because the API port is never published; Caddy is the only client.
# Caddy logs every request (with the payment feed secret masked), so
# uvicorn's own access log, which would print it in full, is off.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY} --proxy-headers --forwarded-allow-ips='*' --no-access-log --no-server-header --no-date-header --timeout-graceful-shutdown 20"]
