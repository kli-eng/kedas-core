# ============================================================
# KEDAS — Router: uso del sistema por establecimiento
# Archivo: api/routers/uso.py
# Licencia: AGPL-3.0-or-later (KLI)
#
# Muestra a la dirección y a la UTP lo que KEDAS entregó (reportes, avisos a
# apoderados) y lo que pidió digitar, en el mes y en el año. Sale de la bitácora
# (kedas_audit_log): solo cantidades de acciones, nunca personas.
#
# Cómo se atribuye cada acción al establecimiento: la bitácora no guarda el
# establecimiento, sino el seudónimo de la cuenta que actuó. Se calculan los
# seudónimos de las cuentas del establecimiento (hash_actor_id) y se cuentan
# solo esas filas; los seudónimos no salen de esta función.
# Límites conocidos:
#   - las acciones de cuentas ya eliminadas no se atribuyen;
#   - si cambia KEDAS_PSEUDONIMO_SALT, las acciones anteriores dejan de atribuirse;
#   - no mide tiempo: el tiempo ahorrado se mostrará cuando haya mediciones reales.
# ============================================================

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

import asyncpg
from fastapi import APIRouter, Depends, HTTPException

from api.routers.auth import TokenData, verificar_permiso, hash_actor_id
from api.routers.estudiantes import get_db

logger = logging.getLogger("kedas.uso")
router = APIRouter()

ROLES_USO = {"director", "utp"}
ENTREGAS = ["reporte", "reporte_generado", "exportacion"]
COMUNICACIONES = ["notificacion_apoderado_enviada"]          # solo las enviadas
DIGITADOS = ["escritura", "incidente_registrado", "medida_proteccion_registrada",
             "incidente_cerrado", "incidente_derivado", "incidente_reabierto",
             "incidente_completado", "alerta_confirmada", "alerta_desestimada"]
NOTA_TIEMPO = "El tiempo ahorrado se mostrará cuando haya mediciones con colegios."
COMO_SE_CUENTA = (
    "Conteos de la bitácora de KEDAS para las cuentas actuales del establecimiento. "
    "Reportes entregados: reportes y exportaciones descargados. Avisos a apoderados: correos "
    "enviados por KEDAS. Registros digitados: incidentes, medidas, cambios de estado y revisión "
    "de alertas escritos en KEDAS. Datos reutilizados: registros que los reportes tomaron de "
    "KEDAS sin volver a digitarlos (se cuentan desde que los reportes empezaron a anotarlo). "
    "No incluye acciones de cuentas eliminadas."
)
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]
_TZ = "'America/Santiago'"
_INICIO_MES = f"(date_trunc('month', now() AT TIME ZONE {_TZ}) AT TIME ZONE {_TZ})"
_INICIO_ANIO = f"(date_trunc('year', now() AT TIME ZONE {_TZ}) AT TIME ZONE {_TZ})"


def _bloque(f, sufijo):
    return {
        "reportes_entregados": f[f"entregas_{sufijo}"],
        "avisos_apoderados": f[f"avisos_{sufijo}"],
        "registros_digitados": f[f"digitados_{sufijo}"],
        # None = ningún reporte del período anotó cuántos registros usó (no es «cero»)
        "datos_reutilizados": f[f"reutilizados_{sufijo}"] if f[f"con_registros_{sufijo}"] else None,
    }


@router.get("/{establecimiento_id}", summary="Lo que KEDAS entregó y lo que pidió digitar (conteos)")
async def uso_establecimiento(
    establecimiento_id: int,
    usuario: TokenData = Depends(verificar_permiso("reportes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    if usuario.rol not in ROLES_USO:
        raise HTTPException(403, "Solo la dirección y la UTP ven el uso del establecimiento.")
    if usuario.establecimiento_id != establecimiento_id:
        raise HTTPException(403, "No autorizado para este establecimiento.")

    cuentas = await conn.fetch(
        "SELECT username FROM kedas_usuarios WHERE establecimiento_id = $1", establecimiento_id)
    actores = sorted({hash_actor_id(r["username"]) for r in cuentas})

    f = await conn.fetchrow(f"""
        WITH b AS (
            SELECT accion, resultado, timestamp_utc >= {_INICIO_MES} AS en_mes,
                   (substring(resultado FROM 'registros=([0-9]+)'))::int AS registros
            FROM kedas_audit_log
            WHERE actor_id = ANY($1::text[])
              AND timestamp_utc >= {_INICIO_ANIO}
        )
        SELECT
            COUNT(*) FILTER (WHERE accion = ANY($2::text[]) AND en_mes)                    AS entregas_mes,
            COUNT(*) FILTER (WHERE accion = ANY($2::text[]))                               AS entregas_anio,
            COUNT(*) FILTER (WHERE accion = ANY($3::text[]) AND resultado = 'enviado' AND en_mes) AS avisos_mes,
            COUNT(*) FILTER (WHERE accion = ANY($3::text[]) AND resultado = 'enviado')     AS avisos_anio,
            COUNT(*) FILTER (WHERE accion = ANY($4::text[]) AND en_mes)                    AS digitados_mes,
            COUNT(*) FILTER (WHERE accion = ANY($4::text[]))                               AS digitados_anio,
            COALESCE(SUM(registros) FILTER (WHERE accion = ANY($2::text[]) AND en_mes), 0) AS reutilizados_mes,
            COALESCE(SUM(registros) FILTER (WHERE accion = ANY($2::text[])), 0)            AS reutilizados_anio,
            COUNT(registros) FILTER (WHERE accion = ANY($2::text[]) AND en_mes) > 0        AS con_registros_mes,
            COUNT(registros) FILTER (WHERE accion = ANY($2::text[])) > 0                   AS con_registros_anio
        FROM b
    """, actores, ENTREGAS, COMUNICACIONES, DIGITADOS)

    await conn.execute("""
        INSERT INTO kedas_audit_log (actor_id, actor_rol, accion, entidad, resultado)
        VALUES ($1, $2, $3, $4, $5)
    """, usuario.actor_hash, usuario.rol, "lectura", "kedas_audit_log",
        f"exito: uso est={establecimiento_id}")

    ahora = datetime.now(ZoneInfo("America/Santiago"))
    return {
        "establecimiento_id": establecimiento_id,
        "mes": f"{MESES[ahora.month - 1]} {ahora.year}",
        "anio": ahora.year,
        "este_mes": _bloque(f, "mes"),
        "este_anio": _bloque(f, "anio"),
        "nota_tiempo": NOTA_TIEMPO,
        "como_se_cuenta": COMO_SE_CUENTA,
    }
