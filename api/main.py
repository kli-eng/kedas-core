# ============================================================
# KEDAS v3.4.0 — API REST Principal
# Archivo: api/main.py
# Dependencias: fastapi==0.115.0, uvicorn==0.30.0, python-jose==3.3.0,
#               passlib==1.7.4, asyncpg==0.29.0, pydantic==2.7.0,
#               python-multipart==0.0.9
# Licencias: MIT (FastAPI), MIT (uvicorn), MIT (python-jose)
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

# Importar routers de cada módulo
from api.routers import indicadores as indicadores_router
from api.routers import (
    curricular,
    apoderado,
    denuncias,
    ia,
    rea,
    estudiantes, convivencia, predicciones, reportes, auth, dashboard,
    admin, pseudonimos, reportes_slep, kolibri,
)

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
    logger.info("KEDAS v3.4.0 API iniciando...")
    # Aquí se puede inicializar el pool de conexiones a PostgreSQL
    yield
    logger.info("KEDAS v3.4.0 API cerrando conexiones...")


# ── Instancia principal de la API ────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
app = FastAPI(
    title="KEDAS v3.4.0 API",
    description=(
        "API REST del Sistema Kolibri Educational Data AI System v3.0. "
        "Todos los endpoints requieren autenticación JWT. "
        "Los datos de estudiantes están seudonomizados (Art. 2°l Ley 21.719)."
    ),
    version="3.4.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── CORS — restringido al dominio del colegio ─────────────────
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
    """
    Intercepta errores no manejados y los registra sin exponer
    información sensible en la respuesta al cliente.
    """
    logger.error(f"Error no manejado en {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Error interno del servidor. Contacte al administrador del sistema."}
    )


# ── Registrar routers ─────────────────────────────────────────
app.include_router(auth.router,         prefix="/api/v1/auth",        tags=["Autenticación"])
app.include_router(estudiantes.router,  prefix="/api/v1/estudiantes", tags=["Estudiantes"])
app.include_router(convivencia.router,  prefix="/api/v1/convivencia", tags=["Convivencia"])
app.include_router(predicciones.router, prefix="/api/v1/predicciones",tags=["Predicciones IA"])
app.include_router(reportes.router,     prefix="/api/v1/reportes",    tags=["Reportes"])
app.include_router(dashboard.router,    prefix="/api/v1/dashboard",    tags=["Dashboard"])
app.include_router(admin.router,          prefix="/api/v1/admin",       tags=["Administración"])
app.include_router(pseudonimos.router,    prefix="/api/v1",             tags=["Seudónimos"])
app.include_router(reportes_slep.router,  prefix="/api/v1/reportes",    tags=["Reportes SLEP"])
app.include_router(kolibri.router,         prefix="/api/v1/kolibri",    tags=["Kolibri"])
app.include_router(rea.router,        prefix="/api/v1",             tags=["REA"])
app.include_router(ia.router,         prefix="/api/v1",             tags=["IA Local"])
app.include_router(denuncias.router,  prefix="/api/v1",             tags=["Denuncias Ley Karin"])
app.include_router(indicadores_router.router, prefix="/api/v1/indicadores", tags=["Indicadores Contexto"])
app.include_router(curricular.router, prefix="/api/v1/curricular",
                             tags=["Inteligencia Curricular"])
app.include_router(apoderado.router,  prefix="/api/v1",             tags=["Portal Apoderado"])


# ── Health check (sin autenticación) ─────────────────────────
@app.get("/health", tags=["Sistema"])
async def health_check():
    """
    Endpoint de salud para healthchecks de Docker y monitoreo Prometheus.
    No requiere autenticación. No expone información sensible.
    """
    return {"estado": "ok", "version": "3.4.0", "sistema": "KEDAS"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=False)
