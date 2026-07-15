# ============================================================
# KEDAS v3.0 — Router: Estudiantes
# Archivo: api/routers/estudiantes.py
# Dependencias: asyncpg==0.29.0, pydantic==2.7.0
# ============================================================

import os
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import asyncpg
import json
from api.routers.auth import (
    TokenData, obtener_usuario_actual, verificar_permiso, hash_actor_id
)

logger = logging.getLogger("kedas.estudiantes")
router = APIRouter()


# ── Pool de conexiones PostgreSQL ────────────────────────────
async def get_db():
    """
    Conexión asyncpg por request. Fix C-53: registra codec jsonb
    para que pgp_sym_decrypt(...)::jsonb deserialice a dict en lugar
    de str — necesario en /estudiantes/{hash}/perfil línea 144.
    """
    conn = await asyncpg.connect(os.environ["KEDAS_DATABASE_URL"])
    try:
        await conn.set_type_codec(
            "jsonb",
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog",
        )
        await conn.set_type_codec(
            "json",
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog",
        )
        yield conn
    finally:
        await conn.close()
# ── Modelos de respuesta ─────────────────────────────────────
class PerfilEstudianteResponse(BaseModel):
    hash_id:            str
    # El nombre solo se retorna si el rol tiene permiso de reidentificación
    nombre_display:     Optional[str] = None
    curso:              Optional[str] = None
    riesgo_score:       Optional[float] = None
    risk_level:         Optional[str] = None
    # Top 3 factores SHAP en lenguaje natural
    factores_riesgo:    Optional[list] = None
    asistencia_pct:     Optional[float] = None
    semaforo_asistencia: Optional[str] = None
    # Features DUA del último análisis
    perfil_modal:       Optional[dict] = None
    # Incidentes de convivencia activos (solo conteo, no tipo — BC-02)
    incidentes_activos: Optional[int] = None
    consentimiento_predictivo: bool = False


class ProgresoEstudianteResponse(BaseModel):
    hash_id:            str
    periodo:            str
    interacciones_total: int
    contenidos_completados: int
    tiempo_total_horas:  float
    dua_ratio_video:    float
    dua_ratio_ejercicio: float
    dua_diversidad_modal: float
    dua_ratio_completacion: float


# ── Endpoints ─────────────────────────────────────────────────

@router.get(
    "/{hash_id}/perfil",
    response_model=PerfilEstudianteResponse,
    summary="Perfil completo del estudiante con historial"
)
async def obtener_perfil_estudiante(
    hash_id: str,
    usuario: TokenData = Depends(verificar_permiso("estudiantes:leer")),
    conn: asyncpg.Connection = Depends(get_db)
):
    """
    Retorna el perfil completo del estudiante identificado por su hash_id (seudónimo).

    - Docente/UTP: ve nombre y datos académicos completos.
    - Apoderado: solo ve datos de su propio hijo/a.
    - El tipo de incidente de convivencia NO se retorna aquí (BC-02).
    - Registra acceso en kedas_audit_log (Art. 3°a Ley 21.719).
    """
    # ── 1. Verificar que el estudiante existe en el sistema ──
    perfil_riesgo = await conn.fetchrow("""
        SELECT riesgo_score, risk_level, shap_top3, dua_features, confianza
        FROM kedas_perfiles_riesgo
        WHERE hash_id = $1
        ORDER BY timestamp_utc DESC
        LIMIT 1
    """, hash_id)

    if not perfil_riesgo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estudiante no encontrado o sin perfil de riesgo generado."
        )

    # ── 2. Verificar consentimiento predictivo ───────────────
    consentimiento = await conn.fetchrow("""
        SELECT capa_2_predictiva
        FROM kedas_consentimientos
        WHERE hash_estudiante = $1 AND revocado_en IS NULL
        ORDER BY timestamp_utc DESC LIMIT 1
    """, hash_id)

    tiene_consentimiento = bool(consentimiento and consentimiento["capa_2_predictiva"])

    # ── 3. Datos de asistencia (últimos 30 días) ─────────────
    asistencia = await conn.fetchrow("""
        SELECT
            COUNT(*) FILTER (WHERE estado = 'presente') AS presentes,
            COUNT(*) AS total,
            MAX(semaforo) AS semaforo_actual
        FROM kedas_asistencia
        WHERE hash_id = $1
          AND fecha >= CURRENT_DATE - INTERVAL '30 days'
    """, hash_id)

    pct_asistencia = None
    if asistencia and asistencia["total"] > 0:
        pct_asistencia = round(asistencia["presentes"] / asistencia["total"] * 100, 1)

    # ── 4. Conteo de incidentes activos (solo conteo, no tipo) ─
    incidentes = await conn.fetchval("""
        SELECT COUNT(*)
        FROM kedas_conv_incidentes
        WHERE hash_estudiante = $1 AND estado = 'abierto'
    """, hash_id)

    # ── 5. Reidentificación del nombre (solo roles autorizados) ─
    nombre_display = None
    curso = None
    if usuario.rol in {"docente", "utp", "director", "orientador",
                       "psicologo", "coordinador_convivencia"}:
        # Desencriptar datos de identidad desde kedas_pseudonimos
        # (join solo en Capa 1, nunca en Capa 3)
        llave = os.environ.get("KEDAS_PGCRYPTO_KEY", "")
        identidad = await conn.fetchrow("""
            SELECT pgp_sym_decrypt(datos_cifrados, $1)::jsonb AS datos
            FROM kedas_pseudonimos
            WHERE hash_id = $2
        """, llave, hash_id)
        if identidad and identidad["datos"]:
            datos = identidad["datos"]
            nombre_display = datos.get("nombre_completo", "Sin nombre")
            curso          = datos.get("curso", "")

    # ── 6. Transformar SHAP a lenguaje natural ───────────────
    factores = []
    if perfil_riesgo["shap_top3"] and tiene_consentimiento:
        TRADUCCIONES = {
            "days_active_last_month":   "Días activo en el último mes",
            "dua_ratio_completacion":   "Tasa de completación de contenidos",
            "time_spent_avg":           "Tiempo promedio por sesión",
            "mastery_level_avg":        "Nivel de dominio promedio",
            "dua_diversidad_modal":     "Diversidad de formatos usados",
            "conv_incidentes_30d":      "Incidentes de convivencia recientes",
            "asist_tendencia_7d":       "Tendencia de asistencia (última semana)",
        }
        for factor in perfil_riesgo["shap_top3"]:
            nombre_legible = TRADUCCIONES.get(
                factor.get("factor"), factor.get("factor", "Variable desconocida")
            )
            factores.append({
                "factor":      nombre_legible,
                "importancia": factor.get("valor", 0),
                "direccion":   "aumenta riesgo" if factor.get("valor", 0) > 0 else "reduce riesgo"
            })

    # ── 7. Registrar acceso en audit_log ─────────────────────
    await conn.execute("""
        INSERT INTO kedas_audit_log
            (actor_id, actor_rol, accion, entidad, hash_estudiante, resultado)
        VALUES ($1, $2, $3, $4, $5, $6)
    """,
        hash_actor_id(usuario.actor_hash),
        usuario.rol,
        "lectura",
        "kedas_perfiles_riesgo",
        hash_id,
        "exito"
    )

    return PerfilEstudianteResponse(
        hash_id=hash_id,
        nombre_display=nombre_display,
        curso=curso,
        riesgo_score=float(perfil_riesgo["riesgo_score"]) if tiene_consentimiento else None,
        risk_level=perfil_riesgo["risk_level"] if tiene_consentimiento else None,
        factores_riesgo=factores,
        asistencia_pct=pct_asistencia,
        semaforo_asistencia=asistencia["semaforo_actual"] if asistencia else None,
        perfil_modal=perfil_riesgo["dua_features"],
        incidentes_activos=int(incidentes) if incidentes else 0,
        consentimiento_predictivo=tiene_consentimiento,
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
    Solo muestra datos del propio estudiante si el rol es 'apoderado'.
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
        dua_diversidad_modal=0.0,   # calculado en pipeline ML
        dua_ratio_completacion=round(float(resultado["dua_ratio_completacion"] or 0), 3),
    )


# ── Listar estudiantes del establecimiento (Perfil 360°) ──────────────────
class EstudianteListaItem(BaseModel):
    hash_id:      str
    nombre:       Optional[str] = None
    curso:        Optional[str] = None
    risk_level:   Optional[str] = None
    riesgo_score: Optional[float] = None

@router.get(
    "",
    response_model=list[EstudianteListaItem],
    summary="Listar estudiantes del establecimiento con nivel de riesgo",
)
async def listar_estudiantes(
    usuario: TokenData = Depends(verificar_permiso("estudiantes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Retorna lista de estudiantes del establecimiento con su perfil de riesgo más reciente."""
    if not usuario.establecimiento_id:
        raise HTTPException(403, "Este endpoint requiere un usuario asociado a un establecimiento.")

    llave = os.environ.get("KEDAS_PGCRYPTO_KEY", "")
    rows = await conn.fetch("""
        SELECT DISTINCT ON (ps.hash_id)
            ps.hash_id,
            pgp_sym_decrypt(ps.datos_cifrados, $1)::jsonb AS datos,
            pr.risk_level,
            pr.riesgo_score
        FROM kedas_pseudonimos ps
        LEFT JOIN kedas_perfiles_riesgo pr ON ps.hash_id = pr.hash_id
        WHERE ps.establecimiento_id = $2
        ORDER BY ps.hash_id, pr.timestamp_utc DESC NULLS LAST
    """, llave, usuario.establecimiento_id)

    return [
        EstudianteListaItem(
            hash_id=r["hash_id"],
            nombre=r["datos"].get("nombre_completo") if r["datos"] else None,
            curso=r["datos"].get("curso") if r["datos"] else None,
            risk_level=r["risk_level"],
            riesgo_score=float(r["riesgo_score"]) if r["riesgo_score"] else None,
        )
        for r in rows
    ]
