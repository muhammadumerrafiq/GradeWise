"""
GradeWise — FastAPI Application Entry Point
"""

from contextlib import asynccontextmanager
import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from config import settings
from database import create_tables, engine

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    log.info("GradeWise starting up")
    settings.create_directories()
    log.info("Directories verified", upload=settings.UPLOAD_DIR, export=settings.EXPORT_DIR)

    # Initialize database tables & seed initial teacher/settings
    try:
        await create_tables()
        log.info("Database initialized successfully")
    except Exception as e:
        log.error("Failed to initialize database tables", error=str(e))

    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        log.warning("GEMINI_API_KEY not configured — evaluation will require key in Settings")

    yield

    log.info("GradeWise shutting down")
    await engine.dispose()


app = FastAPI(
    title="GradeWise API",
    description="AI-Powered English Assignment Evaluator",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url=None,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Standardized error handlers returning {"error": "...", "detail": "..."}
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    error_details = []
    for err in exc.errors():
        loc = " -> ".join(str(l) for l in err.get("loc", []))
        msg = err.get("msg", "")
        error_details.append(f"{loc}: {msg}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "Request validation failed. Please check input fields.",
            "detail": "; ".join(error_details),
        },
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail_msg = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    error_msg = "An error occurred."
    if exc.status_code == 404:
        error_msg = "The requested resource was not found."
    elif exc.status_code == 400:
        error_msg = "Invalid request."
    elif exc.status_code == 403:
        error_msg = "Forbidden."

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": error_msg,
            "detail": detail_msg,
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    log.error("Unhandled server exception", error=str(exc))
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error. Please try again or check server logs.",
            "detail": str(exc) if settings.DEBUG else "Internal error",
        },
    )


# Health check endpoint
@app.get("/api/health")
async def health_check():
    """Health check endpoint. Does NOT expose API key or secrets."""
    return {
        "status": "ok",
        "version": "1.0.0",
        "gemini_configured": bool(
            settings.GEMINI_API_KEY
            and settings.GEMINI_API_KEY != "your_gemini_api_key_here"
        ),
    }


# Import and register routers
from routers import assignments, evaluations, export, files, manual, results, settings_router, submissions

# 0. Manual paste workflow: /api/manual/...
app.include_router(manual.router, prefix="/api/manual", tags=["manual"])

# 0b. Files direct router: /api/files/...
app.include_router(files.router, prefix="/api", tags=["files"])

# 1. Assignments CRUD: /api/assignments
app.include_router(assignments.router, prefix="/api/assignments", tags=["assignments"])

# 2. Batch evaluation: /api/assignments/{assignment_id}/evaluate, progress, pause, resume, cancel
app.include_router(evaluations.batch_eval_router, prefix="/api/assignments", tags=["batch-evaluation"])

# 3. Submissions upload & list: /api/assignments/{assignment_id}/upload, submissions, name-mapping/batch
app.include_router(submissions.router, prefix="/api/assignments", tags=["submissions-assignment"])

# 4. Submissions item actions: /api/submissions/{id}/student, DELETE /{id}, GET /{id}/file
app.include_router(submissions.router, prefix="/api/submissions", tags=["submissions-direct"])

# 5. Single submission retry & regenerate: /api/submissions/{submission_id}/retry, regenerate
app.include_router(evaluations.submission_retry_router, prefix="/api/submissions", tags=["submission-retry"])

# 6. Evaluation detail, edit & approve: /api/evaluations/{id}, PUT /{id}, POST /{id}/approve
app.include_router(evaluations.evaluations_router, prefix="/api/evaluations", tags=["evaluations-detail"])

# 7. Results: /api/assignments/{assignment_id}/results
app.include_router(results.router, prefix="/api/assignments", tags=["results"])

# 8. Export generation & history: /api/assignments/{assignment_id}/export, exports
app.include_router(export.router, prefix="/api/assignments", tags=["export-assignment"])

# 9. Export download endpoints: /api/export/downloads/{id}, /api/exports/{id}/download, /api/export/single/...
app.include_router(export.router, prefix="/api", tags=["export-downloads"])

# 10. Settings: /api/settings
app.include_router(settings_router.router, prefix="/api/settings", tags=["settings"])
