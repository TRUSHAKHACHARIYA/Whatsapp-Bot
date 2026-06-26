from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.auth.router import router as auth_router
from app.whatsapp.router import router as whatsapp_router
from app.whatsapp.contacts_router import router as contacts_router
from app.whatsapp.templates_router import router as templates_router
from app.leads.router import router as leads_router
from app.campaigns.router import router as campaigns_router
from app.analytics.router import router as analytics_router
from app.chat.router import router as chat_router
from app.faq.router import router as faq_router
from app.forms.router import router as forms_router
from app.tenants.router import router as tenants_router
from app.subscriptions.router import router as subscriptions_router
from app.bot.router import router as bot_router

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Multi-tenant WhatsApp Business SaaS Platform",
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
)

# ─── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

API_PREFIX = "/api"

app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(whatsapp_router, prefix=API_PREFIX)
app.include_router(contacts_router, prefix=API_PREFIX)
app.include_router(templates_router, prefix=API_PREFIX)
app.include_router(leads_router, prefix=API_PREFIX)
app.include_router(campaigns_router, prefix=API_PREFIX)
app.include_router(analytics_router, prefix=API_PREFIX)
app.include_router(chat_router, prefix=API_PREFIX)
app.include_router(faq_router, prefix=API_PREFIX)
app.include_router(forms_router, prefix=API_PREFIX)
app.include_router(tenants_router, prefix=API_PREFIX)
app.include_router(subscriptions_router, prefix=API_PREFIX)
app.include_router(bot_router, prefix=API_PREFIX)


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}


# ─── DB init on startup ───────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    from app.database.session import engine
    from app.database.models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print(f"[{settings.APP_NAME}] Started — v{settings.APP_VERSION}")
