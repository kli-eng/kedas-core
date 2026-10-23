# ============================================================
# KEDAS — Asistencia con las definiciones oficiales del Mineduc
# Archivo: api/asistencia.py · Licencia: AGPL-3.0-or-later (KLI)
#
# - Tasa = días asistidos / días con registro × 100 (fórmula del Mineduc:
#   días asistidos / días trabajados).
# - Día asistido = «presente» o «tardanza»; las ausencias
#   justificadas cuentan como inasistencia, igual que en la tasa oficial.
# - TAC = tasa acumulada del año (de la fecha con registro más reciente);
#   TAM = tasa del mes más reciente con registros. La categoría se calcula
#   con la TAC (prioridad del Centro de Estudios); la TAM es complemento.
# - Categorías desde enero de 2025 (Mineduc, Centro de Estudios, Apuntes 109):
#   esperada [90-100], reiterada [85-90), grave [50-85), crítica [0-50).
# Tablas (Core): kedas_asistencia, kedas_cursos. Sin datos: valores None.
# ============================================================
from typing import Optional

FUENTE = "Categorías del Mineduc, Centro de Estudios (Apuntes 109, 2026)"
ETIQUETAS = {
    "esperada":  "Asistencia esperada",
    "reiterada": "Inasistencia reiterada",
    "grave":     "Inasistencia grave",
    "critica":   "Inasistencia crítica",
}
_MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
          "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
_ASISTIDO = "estado IN ('presente', 'tardanza')"


def categoria(tasa: Optional[float]) -> Optional[str]:
    if tasa is None:
        return None
    if tasa >= 90:
        return "esperada"
    if tasa >= 85:
        return "reiterada"
    if tasa >= 50:
        return "grave"
    return "critica"


def _r(x) -> Optional[float]:
    return round(float(x), 1) if x is not None else None


def _mes(fecha) -> Optional[str]:
    return f"{_MESES[fecha.month - 1]} {fecha.year}" if fecha else None


async def tasas_estudiante(conn, hash_id: str) -> dict:
    """TAC, TAM y categoría oficial de un estudiante."""
    f = await conn.fetchrow(f"""
        WITH d AS (SELECT fecha, estado FROM kedas_asistencia WHERE hash_id = $1),
             ref AS (SELECT MAX(fecha) AS ultima FROM d)
        SELECT ref.ultima,
               100.0 * COUNT(*) FILTER (WHERE {_ASISTIDO} AND date_trunc('year', fecha) = date_trunc('year', ref.ultima))
                     / NULLIF(COUNT(*) FILTER (WHERE date_trunc('year', fecha) = date_trunc('year', ref.ultima)), 0) AS tac,
               100.0 * COUNT(*) FILTER (WHERE {_ASISTIDO} AND date_trunc('month', fecha) = date_trunc('month', ref.ultima))
                     / NULLIF(COUNT(*) FILTER (WHERE date_trunc('month', fecha) = date_trunc('month', ref.ultima)), 0) AS tam
        FROM d, ref GROUP BY ref.ultima
    """, hash_id)
    tac = _r(f["tac"]) if f else None
    cat = categoria(tac)
    return {
        "asistencia_tac": tac,
        "asistencia_tam": _r(f["tam"]) if f else None,
        "asistencia_mes": _mes(f["ultima"]) if f else None,
        "asistencia_categoria": cat,
        "asistencia_categoria_etiqueta": ETIQUETAS.get(cat),
    }


async def resumen_establecimiento(conn, establecimiento_id: int) -> dict:
    """TAC y TAM del establecimiento y cuántos estudiantes hay en cada categoría (por su TAC)."""
    filas = await conn.fetch(f"""
        WITH d AS (
            SELECT a.hash_id, a.fecha, a.estado
            FROM kedas_asistencia a JOIN kedas_cursos c ON c.id = a.curso_id
            WHERE c.establecimiento_id = $1),
        ref AS (SELECT MAX(fecha) AS ultima FROM d),
        anio AS (SELECT d.* FROM d, ref WHERE date_trunc('year', d.fecha) = date_trunc('year', ref.ultima))
        SELECT 'total' AS nivel, NULL AS hash_id, (SELECT ultima FROM ref) AS ultima,
               100.0 * COUNT(*) FILTER (WHERE {_ASISTIDO}) / NULLIF(COUNT(*), 0) AS tac,
               (SELECT 100.0 * COUNT(*) FILTER (WHERE {_ASISTIDO}) / NULLIF(COUNT(*), 0)
                  FROM d, ref WHERE date_trunc('month', d.fecha) = date_trunc('month', ref.ultima)) AS tam
        FROM anio
        UNION ALL
        SELECT 'estudiante', hash_id, NULL, 100.0 * COUNT(*) FILTER (WHERE {_ASISTIDO}) / COUNT(*), NULL
        FROM anio GROUP BY hash_id
    """, establecimiento_id)
    total = next((f for f in filas if f["nivel"] == "total"), None)
    conteo = {k: 0 for k in ETIQUETAS}
    for f in filas:
        if f["nivel"] == "estudiante":
            conteo[categoria(float(f["tac"]))] += 1
    n = sum(conteo.values())
    return {
        "asistencia_tac": _r(total["tac"]) if total else None,
        "asistencia_tam": _r(total["tam"]) if total else None,
        "asistencia_mes": _mes(total["ultima"]) if total else None,
        "asistencia_categorias": conteo if n else None,
        "asistencia_estudiantes": n,
        "asistencia_fuente": FUENTE,
    }
