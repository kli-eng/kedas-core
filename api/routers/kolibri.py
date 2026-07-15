# ============================================================
# KEDAS v3.1.0 — Router Kolibri
# Archivo: api/routers/kolibri.py
# Sprint 2 — B1.1
# ============================================================

import json
import logging
import os
from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import JSONResponse

from api.routers.auth import TokenData, obtener_usuario_actual
from api.services.kolibri_reader import leer_sesiones_kolibri

logger = logging.getLogger("kedas.kolibri")
router = APIRouter()

KEDAS_INTERNAL_TOKEN = os.getenv("KEDAS_INTERNAL_TOKEN", "")


# ── DB dependency (mismo patrón que estudiantes.py) ──────────────────────────

async def get_db():
    conn = await asyncpg.connect(os.environ["KEDAS_DATABASE_URL"])
    try:
        await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        await conn.set_type_codec("json",  encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        yield conn
    finally:
        await conn.close()


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _verify_internal_token(x_internal_token: str) -> bool:
    if not KEDAS_INTERNAL_TOKEN:
        return False
    return x_internal_token == KEDAS_INTERNAL_TOKEN


# ── GET /api/v1/kolibri/{establecimiento_id} ─────────────────────────────────

@router.get("/{establecimiento_id}", summary="Leer datos Kolibri desde cache", tags=["Kolibri"])
async def get_kolibri_datos(
    establecimiento_id: int,
    usuario: TokenData = Depends(obtener_usuario_actual),
    conn: asyncpg.Connection = Depends(get_db),
):
    row = await conn.fetchrow(
        "SELECT datos, actualizado_at FROM kedas_kolibri_cache WHERE establecimiento_id = $1",
        establecimiento_id,
    )

    if row:
        datos = row["datos"] if isinstance(row["datos"], dict) else json.loads(row["datos"])
        datos["cache_actualizado_at"] = row["actualizado_at"].isoformat()
        datos["fuente"] = "cache"
        return JSONResponse(content=datos)

    logger.info("Cache miss est_id=%s — leyendo on-demand", establecimiento_id)
    datos = leer_sesiones_kolibri(establecimiento_id)
    if datos is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No hay datos Kolibri para establecimiento {establecimiento_id}.",
        )
    datos["fuente"] = "on-demand"
    return JSONResponse(content=datos)


# ── POST /api/v1/kolibri/refresh ─────────────────────────────────────────────

@router.post("/refresh", summary="Re-procesar CSVs Kolibri y actualizar cache", tags=["Kolibri"])
async def refresh_kolibri(
    x_internal_token: str = Header(default=""),
    conn: asyncpg.Connection = Depends(get_db),
):
    if not _verify_internal_token(x_internal_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere X-Internal-Token válido.",
        )

    establecimientos = await conn.fetch(
        "SELECT id, nombre FROM kedas_establecimientos"
    )

    resultados = []
    errores = []

    for est in establecimientos:
        est_id = est["id"]
        est_nombre = est["nombre"]
        try:
            datos = leer_sesiones_kolibri(est_id)
            if datos is None:
                resultados.append({"establecimiento_id": est_id, "estado": "sin_datos"})
                continue

            datos_json = json.dumps(datos, ensure_ascii=False, default=str)
            now = datetime.now(timezone.utc)

            await conn.execute(
                """
                INSERT INTO kedas_kolibri_cache (establecimiento_id, datos, actualizado_at)
                VALUES ($1, $2::jsonb, $3)
                ON CONFLICT (establecimiento_id)
                DO UPDATE SET datos = EXCLUDED.datos, actualizado_at = EXCLUDED.actualizado_at
                """,
                est_id, datos_json, now,
            )

            logger.info("Cache actualizada: est_id=%s sesiones=%s", est_id, datos.get("total_sesiones"))
            resultados.append({
                "establecimiento_id": est_id,
                "nombre": est_nombre,
                "estado": "ok",
                "total_sesiones": datos.get("total_sesiones"),
                "actualizado_at": now.isoformat(),
            })

        except Exception as e:
            logger.error("Error est_id=%s: %s", est_id, e)
            errores.append({"establecimiento_id": est_id, "error": str(e)})

    return JSONResponse(content={
        "status": "ok",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "registros": len([r for r in resultados if r.get("estado") == "ok"]),
        "resultados": resultados,
        "errores": errores,
    })

# ============================================================
# KEDAS v3.2.0 — Patch router Kolibri: endpoint /online
# Archivo: /opt/kedas/kedas/api/routers/kolibri.py
# Agregar este bloque al FINAL del archivo (después del último
# endpoint existente, /refresh)
# Fecha: 17-jun-2026
#
# NOTA: este patch NO requiere imports nuevos. Sigue el mismo estilo
# que el resto de kolibri.py: respuesta como dict + JSONResponse,
# sin modelos Pydantic (BaseModel/List no están importados en el
# archivo real, a diferencia de convivencia.py).
# ============================================================

# — Endpoint GET /kolibri/{establecimiento_id}/online —

@router.get(
    "/{establecimiento_id}/online",
    summary="Resumen del piloto online Kolibri (histórico, noviembre 2025)",
    tags=["Kolibri"],
)
async def get_kolibri_online(
    establecimiento_id: int,
    usuario: TokenData = Depends(obtener_usuario_actual),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Devuelve el resumen agregado de las sesiones ONLINE del piloto Kolibri
    (tabla kedas_kolibri_online). Estos datos son un snapshot histórico
    fijo de noviembre 2025 — NO se actualizan vía cron, a diferencia de
    /kolibri/{establecimiento_id} que sí refleja actividad offline en vivo.

    tasa_completitud y recursos_completados se calculan sobre
    kedas_kolibri_online_resumido (interacciones consolidadas por
    usuario+recurso), que es la fuente oficial ya documentada (70.3%
    en PDF/PPTX). sesiones_totales, usuarios_unicos, tiempo_total_horas
    y recursos_unicos vienen de kedas_kolibri_online (interacciones
    crudas, 58 filas) — son métricas distintas y ambas correctas.
    """
    row = await conn.fetchrow(
        """
        SELECT
            COUNT(*)                                    AS sesiones_totales,
            COUNT(DISTINCT hash_usuario)                 AS usuarios_unicos,
            ROUND(SUM(tiempo_segundos) / 3600.0, 2)       AS tiempo_total_horas,
            COUNT(DISTINCT id_recurso)                    AS recursos_unicos,
            MIN(periodo_piloto)                           AS periodo_piloto
        FROM kedas_kolibri_online
        WHERE establecimiento_id = $1
        """,
        establecimiento_id,
    )

    if row is None or row["sesiones_totales"] == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No hay datos de piloto online para establecimiento {establecimiento_id}.",
        )

    resumido_row = await conn.fetchrow(
        """
        SELECT
            ROUND(
                100.0 * COUNT(*) FILTER (WHERE progreso >= 1.0) / NULLIF(COUNT(*), 0),
                1
            ) AS tasa_completitud
        FROM kedas_kolibri_online_resumido
        WHERE establecimiento_id = $1
        """,
        establecimiento_id,
    )
    tasa_completitud = (
        float(resumido_row["tasa_completitud"])
        if resumido_row and resumido_row["tasa_completitud"] is not None
        else 0.0
    )

    por_asignatura_rows = await conn.fetch(
        """
        SELECT
            asignatura,
            COUNT(*)                                          AS sesiones,
            ROUND(SUM(tiempo_segundos) / 60.0, 1)              AS tiempo_minutos,
            COUNT(*) FILTER (WHERE progreso >= 1.0)            AS recursos_completados
        FROM kedas_kolibri_online
        WHERE establecimiento_id = $1
        GROUP BY asignatura
        ORDER BY sesiones DESC
        """,
        establecimiento_id,
    )

    top_recursos_rows = await conn.fetch(
        """
        SELECT
            titulo_recurso AS titulo,
            COUNT(*)       AS sesiones,
            MODE() WITHIN GROUP (ORDER BY tipo_recurso) AS tipo
        FROM kedas_kolibri_online
        WHERE establecimiento_id = $1
        GROUP BY titulo_recurso
        ORDER BY sesiones DESC
        LIMIT 5
        """,
        establecimiento_id,
    )

    datos = {
        "establecimiento_id": establecimiento_id,
        "periodo_piloto": row["periodo_piloto"],
        "sesiones_totales": row["sesiones_totales"],
        "usuarios_unicos": row["usuarios_unicos"],
        "tiempo_total_horas": float(row["tiempo_total_horas"]),
        "recursos_unicos": row["recursos_unicos"],
        "tasa_completitud": tasa_completitud,
        "por_asignatura": [
            {
                "asignatura": r["asignatura"],
                "sesiones": r["sesiones"],
                "tiempo_minutos": float(r["tiempo_minutos"]),
                "recursos_completados": r["recursos_completados"],
            }
            for r in por_asignatura_rows
        ],
        "top_recursos": [
            {
                "titulo": r["titulo"],
                "sesiones": r["sesiones"],
                "tipo": r["tipo"],
            }
            for r in top_recursos_rows
        ],
    }

    return JSONResponse(content=datos)
