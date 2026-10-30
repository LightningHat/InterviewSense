import logging
from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .config import settings
from .guards.ratelimit import check_rate_limit
from .routes import health, banks, followup, report, bank_generate

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("interviewsense")

app = FastAPI(title="InterviewSense Backend API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.ALLOWED_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Guard Middleware: Body size guard and Rate Limit guard
@app.middleware("http")
async def guards_middleware(request: Request, call_next):
    # 1. Rate limiting by client IP
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not check_rate_limit(client_ip):
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"error": {"code": "rate_limited", "message": "Too many requests. Please wait.", "retryable": True}}
        )

    # 2. Reject request bodies exceeding 8 KB limit
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > 8192:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"error": {"code": "bad_request", "message": "Payload exceeds 8 KB limit", "retryable": False}}
        )

    response = await call_next(request)
    return response

# Mount routes
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(banks.router, prefix="/api", tags=["banks"])
app.include_router(followup.router, prefix="/api", tags=["followup"])
app.include_router(report.router, prefix="/api", tags=["report"])
app.include_router(bank_generate.router, prefix="/api", tags=["bank_generate"])
