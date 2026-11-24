import logging

import asyncpg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("api")


class ApiError(Exception):
    """An error the client is allowed to see. Body: {"error": {"code", "message"}}."""

    def __init__(self, status: int, code: str, message: str, headers: dict | None = None):
        self.status = status
        self.code = code
        self.message = message
        self.headers = headers


def not_found(what: str = "resource") -> ApiError:
    return ApiError(404, "not_found", f"{what.capitalize()} not found.")


def forbidden(message: str = "You do not have access to this.") -> ApiError:
    return ApiError(403, "forbidden", message)


def conflict(code: str, message: str) -> ApiError:
    return ApiError(409, code, message)


_SQLSTATE_TO_HTTP = {"MK404": 404, "MK409": 409, "MK422": 422}


def _body(code: str, message: str, extra: dict | None = None) -> dict:
    err = {"code": code, "message": message}
    if extra:
        err.update(extra)
    return {"error": err}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return JSONResponse(_body(exc.code, exc.message), status_code=exc.status, headers=exc.headers)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException):
        code = {401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}.get(
            exc.status_code, "http_error"
        )
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(_body(code, message), status_code=exc.status_code, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        # Echo field locations and messages, never the submitted values.
        fields = [
            {"loc": [str(p) for p in e.get("loc", ())], "msg": e.get("msg", "invalid")} for e in exc.errors()
        ]
        return JSONResponse(_body("validation_error", "Some fields are invalid.", {"fields": fields}), status_code=422)

    @app.exception_handler(asyncpg.PostgresError)
    async def _pg_error(request: Request, exc: asyncpg.PostgresError):
        state = getattr(exc, "sqlstate", None)
        if state in _SQLSTATE_TO_HTTP:
            return JSONResponse(
                _body(str(exc.args[0]) if exc.args else "conflict", getattr(exc, "detail", None) or "Request failed."),
                status_code=_SQLSTATE_TO_HTTP[state],
            )
        if isinstance(exc, asyncpg.UniqueViolationError):
            return JSONResponse(_body("already_exists", "That already exists."), status_code=409)
        if isinstance(exc, asyncpg.ForeignKeyViolationError):
            return JSONResponse(_body("invalid_reference", "Something this refers to does not exist."), status_code=422)
        if isinstance(exc, asyncpg.CheckViolationError):
            return JSONResponse(_body("invalid_value", "A value is out of range."), status_code=422)
        log.exception("database error on %s %s", request.method, request.url.path)
        return JSONResponse(_body("internal_error", "Something went wrong."), status_code=500)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(_body("internal_error", "Something went wrong."), status_code=500)
