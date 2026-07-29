# ============================================================
# KEDAS Core — Router: Estudiantes
# Archivo: api/routers/estudiantes.py
# Licencia: AGPL-3.0-or-later (KLI)
#
# REDISEÑADO 29-jul-2026 (DEC-59) respecto a la versión Premium:
# - Se eliminaron riesgo_score, risk_level, factores_riesgo y
#   consentimiento_predictivo -- dependían de kedas_perfiles_riesgo
#   y kedas_consentimientos, ambas tablas exclusivas de Premium
#   (MOD-06 Predicciones y ARCO respectivamente). Core no ejecuta
#   ningún modelo predictivo, por lo que no hay nada que consentir
#   ni que mostrar en ese sentido.
# - obtener_perfil_estudiante() ya NO depende de que exista una fila
#   en kedas_perfiles_riesgo para considerar al estudiante "existente"
#   -- en la versión Premium, sin esa fila el endpoint tiraba 404
#   aunque el estudiante fuera real. Ahora la existencia se verifica
#   directamente contra kedas_pseudonimos.
# - Se eliminó el conteo de incidentes de convivencia (kedas_conv_incidentes
#   es 100% Premium, módulo Convivencia Escolar).
#
# Tablas usadas (todas Core): kedas_pseudonimos, kedas_asistencia,
# kedas_cursos, kedas_audit_log.
# ============================================================

import os
import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import asyncpg

from api.routers.auth import TokenData, verificar_permiso, hash_actor_id

logger = logging.getLogger("kedas.estudiantes")
router = APIRouter()


# ── Pool de conexiones PostgreSQL ────────────────────────────
async def get_db():
    """
    Conexión asyncpg por request. Registra codec jsonb para que
    pgp_sym_decrypt(...)::jsonb deserialice a dict en lugar de str.
    """
    conn = await asyncpg.connect(os.environ["KEDAS_DATABASE_URL"])
    try:
        await conn.set_type_codec(
            "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog",
        )
        await conn.set_type_codec(
            "json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog",
        )
        yield conn
    finally:
        await conn.close()


class PerfilEstudianteResponse(BaseModel):
    hash_id:             str
    # El nombre solo se retorna si el rol tiene permiso de reidentificación
    nombre_display:      Optional[str] = None
    curso:               Optional[str] = None
    asistencia_pct:      Optional[float] = None
    semaforo_asistencia: Optional[str] = None


class ProgresoEstudianteResponse(BaseModel):
    hash_id:                str
    periodo:                str
    interacciones_total:    int
    contenidos_completados: int
    tiempo_total_horas:     float
    dua_ratio_video:        float
    dua_ratio_ejercicio:    float
    dua_diversidad_modal:   float
    dua_ratio_completacion: float


@router.get(
    "/{hash_id}/perfil",
    response_model=PerfilEstudianteResponse,
    summary="Perfil básico de un estudiante (Core — sin datos predictivos)"
)
async def obtener_perfil_estudiante(
    hash_id: str,
    usuario: TokenData = Depends(verificar_permiso("estudiantes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Retorna datos básicos del estudiante: nombre (si el rol puede
    reidentificar), curso, y asistencia reciente. No incluye riesgo
    predictivo -- ese cálculo vive en el módulo Premium de Predicciones
    (MOD-06), no disponible en Core.
    """
    llave = os.environ.get("KEDAS_PGCRYPTO_KEY", "")

    # Existencia real del estudiante: kedas_pseudonimos, no una tabla Premium.
    pseudonimo = await conn.fetchrow("""
        SELECT hash_id, pgp_sym_decrypt(datos_cifrados, $1)::jsonb AS datos,
               establecimiento_id
        FROM kedas_pseudonimos
        WHERE hash_id = $2
    """, llave, hash_id)

    if not pseudonimo:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado.")

    if usuario.rol != "admin" and usuario.establecimiento_id != pseudonimo["establecimiento_id"]:
        raise HTTPException(status_code=403, detail="No autorizado para este estudiante.")

    datos = pseudonimo["datos"] or {}

    # Asistencia últimos 30 días
    asist = await conn.fetchrow("""
        SELECT
            ROUND(100.0 * COUNT(*) FILTER (WHERE a.estado = 'presente')
                  / NULLIF(COUNT(*), 0), 1) AS pct,
            MAX(a.semaforo) FILTER (WHERE a.fecha >= CURRENT_DATE - INTERVAL '7 days') AS semaforo
        FROM kedas_asistencia a
        WHERE a.hash_id = $1
          AND a.fecha >= CURRENT_DATE - INTERVAL '30 days'
    """, hash_id)

    await conn.execute("""
        INSERT INTO kedas_audit_log
            (actor_id, actor_rol, accion, entidad, hash_estudiante, resultado)
        VALUES ($1, $2, $3, $4, $5, $6)
    """,
        hash_actor_id(usuario.actor_hash), usuario.rol,
        "lectura", "kedas_pseudonimos", hash_id, "exito"
    )

    return PerfilEstudianteResponse(
        hash_id=hash_id,
        nombre_display=datos.get("nombre_completo"),
        curso=datos.get("curso"),
        asistencia_pct=float(asist["pct"]) if asist and asist["pct"] is not None else None,
        semaforo_asistencia=asist["semaforo"] if asist else None,
    )


@router.get(
    "/{hash_id}/progreso",
    response_model=ProgresoEstudianteResponse,
    summary="Progreso académico del estudiante (datos DUA)"
)
async def obtener_progreso_estudiante(
    hash_id: str,
    periodo_dias: int = 30,
    usuario: TokenData = Depends(verificar_permiso("estudiantes:leer")),
    conn: asyncpg.Connection = Depends(get_db)
):
    """
    Retorna el progreso académico y perfil DUA del estudiante.
    Sin cambios respecto a Premium -- ya era Core-safe (solo usa
    kedas_interacciones_kolibri, tabla Core).
    """
    resultado = await conn.fetchrow("""
        SELECT
            COUNT(*) AS interacciones_total,
            COUNT(*) FILTER (WHERE complete = TRUE) AS contenidos_completados,
            COALESCE(SUM(time_spent) / 3600.0, 0) AS tiempo_total_horas,
            COALESCE(AVG(CASE WHEN content_kind = 'video' THEN 1.0 ELSE 0.0 END), 0)
                AS dua_ratio_video,
            COALESCE(AVG(CASE WHEN content_kind = 'exercise' THEN 1.0 ELSE 0.0 END), 0)
                AS dua_ratio_ejercicio,
            COALESCE(AVG(CASE WHEN complete = TRUE THEN 1.0 ELSE 0.0 END), 0)
                AS dua_ratio_completacion
        FROM kedas_interacciones_kolibri
        WHERE hash_id = $1
          AND timestamp_inicio >= CURRENT_TIMESTAMP - make_interval(days => $2)
    """, hash_id, periodo_dias)

    return ProgresoEstudianteResponse(
        hash_id=hash_id,
        periodo=f"últimos {periodo_dias} días",
        interacciones_total=resultado["interacciones_total"] or 0,
        contenidos_completados=resultado["contenidos_completados"] or 0,
        tiempo_total_horas=round(float(resultado["tiempo_total_horas"] or 0), 2),
        dua_ratio_video=round(float(resultado["dua_ratio_video"] or 0), 3),
        dua_ratio_ejercicio=round(float(resultado["dua_ratio_ejercicio"] or 0), 3),
        dua_diversidad_modal=0.0,   # calculado en pipeline ML -- no disponible en Core
        dua_ratio_completacion=round(float(resultado["dua_ratio_completacion"] or 0), 3),
    )


class EstudianteListaItem(BaseModel):
    hash_id: str
    nombre:  Optional[str] = None
    curso:   Optional[str] = None


@router.get(
    "",
    response_model=list[EstudianteListaItem],
    summary="Listar estudiantes del establecimiento (Core — sin riesgo predictivo)"
)
async def listar_estudiantes(
    usuario: TokenData = Depends(verificar_permiso("estudiantes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Retorna la lista de estudiantes del establecimiento. No incluye
    riesgo predictivo -- ver nota de cabecera del archivo."""
    if not usuario.establecimiento_id:
        raise HTTPException(403, "Este endpoint requiere un usuario asociado a un establecimiento.")

    llave = os.environ.get("KEDAS_PGCRYPTO_KEY", "")
    rows = await conn.fetch("""
        SELECT
            ps.hash_id,
            pgp_sym_decrypt(ps.datos_cifrados, $1)::jsonb AS datos
        FROM kedas_pseudonimos ps
        WHERE ps.establecimiento_id = $2
        ORDER BY ps.hash_id
    """, llave, usuario.establecimiento_id)

    return [
        EstudianteListaItem(
            hash_id=r["hash_id"],
            nombre=r["datos"].get("nombre_completo") if r["datos"] else None,
            curso=r["datos"].get("curso") if r["datos"] else None,
        )
        for r in rows
    ]
