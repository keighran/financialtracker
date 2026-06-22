import logging
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.db import create_db_and_tables
from app.middleware.error_handler import GlobalErrorHandlerMiddleware
from app.middleware.rate_limit import limiter
from app.api import webhooks, billing, admin, onboarding, ledgers, tax_projections, dashboard

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Australian FIRE Manager API",
    description="SaaS wealth tracking and FIRE manager with Australian tax rules compliance",
    version="1.0.0"
)

# Apply middlewares
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(GlobalErrorHandlerMiddleware)

# CORS configurations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production environments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers under /api
api_router = APIRouter(prefix="/api")
api_router.include_router(webhooks.router)
api_router.include_router(billing.router)
api_router.include_router(admin.router)
api_router.include_router(onboarding.router)
api_router.include_router(ledgers.router)
api_router.include_router(tax_projections.router)
api_router.include_router(dashboard.router)

app.include_router(api_router)

@app.on_event("startup")
def on_startup():
    logger.info("Initializing database and seeding default tables...")
    create_db_and_tables()
    logger.info("Database initialized successfully.")

@app.get("/")
def read_root():
    return {"status": "running", "message": "FIRE Wealth Manager API is active."}
