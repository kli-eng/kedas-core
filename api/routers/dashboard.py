# ============================================================
# KEDAS v3.0.2 — Router: Dashboard por perfil
# Archivo: api/routers/dashboard.py (NUEVO)
# Cierra G-02 (frontend sin endpoint de dashboard agregado).
# Dependencias: asyncpg==0.29.0, pydantic==2.7.0
# Licencia: AGPL-3.0-or-later (KLI)
#
# Tablas reales del schema KEDAS v3.0:
#   kedas_establecimientos, kedas_cursos, kedas_asistencia,
#   kedas_perfiles_riesgo, kedas_alertas, kedas_conv_incidentes,
#   v_dashboard_establecimiento (fix C-49 aplicado).
# NO usa kedas_estudiantes ni kedas_evaluaciones (no existen).
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
    estudiantes_riesgo_alto: int
    estudiantes_riesgo_moderado: int
    estudiantes_riesgo_bajo: int
    total_estudiantes_con_riesgo: int
    asistencia_pct_30d: Optional[float] = None
    asistencia_semaforo_rojo: int
    alertas_pendientes: int
    incidentes_abiertos: int
    incidentes_muy_graves: int
    kolibri_sesiones: Optional[dict] = None


async def _agregar_dashboard(
    establecimiento_id: int,
    usuario: TokenData,
    conn: asyncpg.Connection,
) -> DashboardResponse:
    """Lógica común usada por los 3 endpoints de dashboard."""
    # Permiso por establecimiento: admin ve cualquiera; el resto solo el suyo.
    if usuario.rol != "admin" and usuario.establecimiento_id != establecimiento_id:
        raise HTTPException(
            status_code=403, detail="No autorizado para este establecimiento"
        )

    # KPIs principales desde la vista corregida (fix C-49)
    dashboard = await conn.fetchrow(
        "SELECT * FROM v_dashboard_establecimiento WHERE establecimiento_id = $1",
        establecimiento_id,
    )
    if not dashboard:
        raise HTTPException(status_code=404, detail="Establecimiento no encontrado")

    # Asistencia % últimos 30 días (filtrada por cursos del establecimiento)
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

    # Alertas pendientes para estudiantes activos del establecimiento
    alertas_pend = await conn.fetchval("""
        SELECT COUNT(DISTINCT al.id)
        FROM kedas_alertas al
        WHERE al.estado = 'ALERTA_GENERADA'
          AND al.hash_estudiante IN (
              SELECT DISTINCT a.hash_id
              FROM kedas_asistencia a
              JOIN kedas_cursos c ON c.id = a.curso_id
              WHERE c.establecimiento_id = $1
                AND a.fecha >= CURRENT_DATE - INTERVAL '60 days'
          )
    """, establecimiento_id) or 0

    # Datos reales del piloto Kolibri (CSVs en /opt/kedas/data/kolibri/{id}/)
    kolibri = leer_sesiones_kolibri(establecimiento_id)

    # Audit log obligatorio (Art. 3°a Ley 21.719)
    await conn.execute("""
        INSERT INTO kedas_audit_log
            (actor_id, actor_rol, accion, entidad, resultado)
        VALUES ($1, $2, $3, $4, $5)
    """,
        hash_actor_id(usuario.actor_hash), usuario.rol,
        "lectura", "v_dashboard_establecimiento",
        f"exito: establecimiento_id={establecimiento_id}"
    )

    riesgo_alto = dashboard["estudiantes_riesgo_alto"] or 0
    riesgo_mod  = dashboard["estudiantes_riesgo_moderado"] or 0
    riesgo_bajo = dashboard["estudiantes_riesgo_bajo"] or 0

    return DashboardResponse(
        establecimiento_id=dashboard["establecimiento_id"],
        nombre_establecimiento=dashboard["nombre"],
        estudiantes_riesgo_alto=riesgo_alto,
        estudiantes_riesgo_moderado=riesgo_mod,
        estudiantes_riesgo_bajo=riesgo_bajo,
        total_estudiantes_con_riesgo=riesgo_alto + riesgo_mod + riesgo_bajo,
        asistencia_pct_30d=float(asist["pct"]) if asist and asist["pct"] is not None else None,
        asistencia_semaforo_rojo=asist["rojos"] if asist else 0,
        alertas_pendientes=alertas_pend,
        incidentes_abiertos=dashboard["incidentes_abiertos"] or 0,
        incidentes_muy_graves=dashboard["incidentes_muy_graves_abiertos"] or 0,
        kolibri_sesiones=kolibri,
    )


@router.get(
    "/docente/{establecimiento_id}",
    response_model=DashboardResponse,
    summary="Dashboard para perfil docente"
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
    summary="Dashboard para Jefe UTP"
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
    summary="Dashboard institucional para Director"
)
async def dashboard_director(
    establecimiento_id: int,
    usuario: TokenData = Depends(verificar_permiso("reportes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    return await _agregar_dashboard(establecimiento_id, usuario, conn)
