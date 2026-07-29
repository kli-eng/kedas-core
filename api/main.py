# ============================================================
# KEDAS Core — API REST Principal
# Archivo: api/main.py
#
# CORREGIDO 29-jul-2026 (DEC-59): la versión anterior era una copia
# literal de Premium — importaba curricular, apoderado, denuncias, ia,
# convivencia, predicciones, reportes, pseudonimos, reportes_slep,
# indicadores. NINGUNO de esos archivos existe en kedas-core. El API
# nunca pudo arrancar en este repositorio (ModuleNotFoundError en el
# primer import), en ninguna versión anterior a esta.
#
# Registra únicamente los 6 routers reales de Core: auth, estudiantes,
# dashboard, admin, kolibri, rea.
# ============================================================
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.routers import auth, estudiantes, dashboard, admin, kolibri, rea

# ── Configuración de logging ──────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("kedas.api")


# ── Ciclo de vida de la aplicación ───────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicialización y cierre limpio de recursos."""
    logger.info("KEDAS Core API iniciando...")
    yield
    logger.info("KEDAS Core API cerrando conexiones...")


# ── Instancia principal de la API ────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
app = FastAPI(
    title="KEDAS Core API",
    description=(
        "API REST de KEDAS Core — plataforma base gratuita (AGPL v3). "
        "Todos los endpoints requieren autenticación JWT. "
        "Los datos de estudiantes están seudonimizados (Art. 2°l Ley 21.719)."
    ),
    version="3.4.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── CORS ────────────────────────────────────────────────────
ALLOWED_ORIGINS = os.getenv("KEDAS_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


# ── Manejador global de errores ───────────────────────────────
@app.exception_handler(Exception)
async def manejador_errores_global(request: Request, exc: Exception):
    """Intercepta errores no manejados sin exponer información sensible."""
    logger.error(f"Error no manejado en {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Error interno del servidor. Contacte al administrador del sistema."}
    )


# ── Registrar routers (solo los 6 reales de Core) ─────────────
app.include_router(auth.router,        prefix="/api/v1/auth",        tags=["Autenticación"])
app.include_router(estudiantes.router, prefix="/api/v1/estudiantes", tags=["Estudiantes"])
app.include_router(dashboard.router,   prefix="/api/v1/dashboard",   tags=["Dashboard"])
app.include_router(admin.router,       prefix="/api/v1/admin",       tags=["Administración"])
app.include_router(kolibri.router,     prefix="/api/v1/kolibri",     tags=["Kolibri"])
app.include_router(rea.router,         prefix="/api/v1",             tags=["REA"])


# ── Health check (sin autenticación) ─────────────────────────
@app.get("/health", tags=["Sistema"])
async def health_check():
    """Endpoint de salud para healthchecks de Docker. No requiere autenticación."""
    return {"estado": "ok", "version": "3.4.0", "sistema": "KEDAS Core"}
