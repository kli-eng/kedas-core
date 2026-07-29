# ============================================================
# KEDAS Core — Router: Dashboard por perfil
# Archivo: api/routers/dashboard.py
# Licencia: AGPL-3.0-or-later (KLI)
#
# REDISEÑADO 29-jul-2026 (DEC-59) respecto a la versión Premium:
# - La versión Premium usa v_dashboard_establecimiento, una vista que
#   depende de kedas_perfiles_riesgo, kedas_alertas y kedas_conv_incidentes
#   -- las 3 son tablas exclusivas de Premium (MOD-06 Predicciones y
#   MOD-02 Convivencia Escolar). Sin esas tablas, la vista ni siquiera
#   existiría, y estos 3 endpoints (que alimentan la pantalla de inicio
#   de docente/UTP/director) fallarían de inmediato en una instalación
#   Core pura.
# - Esta versión consulta directamente kedas_establecimientos y
#   kedas_asistencia -- ambas Core -- sin pasar por ninguna vista
#   que dependa de módulos Premium.
# - Se eliminaron del response: estudiantes_riesgo_alto/moderado/bajo,
#   alertas_pendientes, incidentes_abiertos, incidentes_muy_graves.
#   Esos datos viven en los módulos Premium correspondientes
#   (Predicciones y Convivencia Escolar) y se sirven desde ahí.
#
# Tablas usadas (todas Core): kedas_establecimientos, kedas_asistencia,
# kedas_cursos, kedas_audit_log.
# ============================================================

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import asyncpg

from api.routers.auth import TokenData, verificar_permiso, hash_actor_id
from api.routers.estudiantes import get_db
from api.services.kolibri_reader import leer_sesiones_kolibri

logger = logging.getLogger("kedas.dashboard")
router = APIRouter()


class DashboardResponse(BaseModel):
    establecimiento_id: int
    nombre_establecimiento: Optional[str] = None
    asistencia_pct_30d: Optional[float] = None
    asistencia_semaforo_rojo: int
    kolibri_sesiones: Optional[dict] = None


async def _agregar_dashboard(
    establecimiento_id: int,
    usuario: TokenData,
    conn: asyncpg.Connection,
) -> DashboardResponse:
    """Lógica común usada por los 3 endpoints de dashboard (Core)."""
    if usuario.rol != "admin" and usuario.establecimiento_id != establecimiento_id:
        raise HTTPException(
            status_code=403, detail="No autorizado para este establecimiento"
        )

    establecimiento = await conn.fetchrow(
        "SELECT id, nombre FROM kedas_establecimientos WHERE id = $1",
        establecimiento_id,
    )
    if not establecimiento:
        raise HTTPException(status_code=404, detail="Establecimiento no encontrado")

    asist = await conn.fetchrow("""
        SELECT
            ROUND(100.0 * COUNT(*) FILTER (WHERE a.estado = 'presente')
                  / NULLIF(COUNT(*), 0), 1) AS pct,
            COUNT(DISTINCT a.curso_id) FILTER (
                WHERE a.semaforo = 'rojo'
                  AND a.fecha >= CURRENT_DATE - INTERVAL '7 days'
            ) AS rojos
        FROM kedas_asistencia a
        JOIN kedas_cursos c ON c.id = a.curso_id
        WHERE c.establecimiento_id = $1
          AND a.fecha >= CURRENT_DATE - INTERVAL '30 days'
    """, establecimiento_id)

    kolibri = leer_sesiones_kolibri(establecimiento_id)

    # Audit log obligatorio (Art. 3°a Ley 21.719)
    await conn.execute("""
        INSERT INTO kedas_audit_log
            (actor_id, actor_rol, accion, entidad, resultado)
        VALUES ($1, $2, $3, $4, $5)
    """,
        hash_actor_id(usuario.actor_hash), usuario.rol,
        "lectura", "kedas_establecimientos",
        f"exito: establecimiento_id={establecimiento_id}"
    )

    return DashboardResponse(
        establecimiento_id=establecimiento["id"],
        nombre_establecimiento=establecimiento["nombre"],
        asistencia_pct_30d=float(asist["pct"]) if asist and asist["pct"] is not None else None,
        asistencia_semaforo_rojo=asist["rojos"] if asist else 0,
        kolibri_sesiones=kolibri,
    )


@router.get(
    "/docente/{establecimiento_id}",
    response_model=DashboardResponse,
    summary="Dashboard para perfil docente (Core)"
)
async def dashboard_docente(
    establecimiento_id: int,
    usuario: TokenData = Depends(verificar_permiso("estudiantes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    return await _agregar_dashboard(establecimiento_id, usuario, conn)


@router.get(
    "/utp/{establecimiento_id}",
    response_model=DashboardResponse,
    summary="Dashboard para Jefe UTP (Core)"
)
async def dashboard_utp(
    establecimiento_id: int,
    usuario: TokenData = Depends(verificar_permiso("reportes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    return await _agregar_dashboard(establecimiento_id, usuario, conn)


@router.get(
    "/director/{establecimiento_id}",
    response_model=DashboardResponse,
    summary="Dashboard institucional para Director (Core)"
)
async def dashboard_director(
    establecimiento_id: int,
    usuario: TokenData = Depends(verificar_permiso("reportes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    return await _agregar_dashboard(establecimiento_id, usuario, conn)
