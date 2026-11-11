# ============================================================
# KEDAS v3.0.2 — Servicio: Lector de registros Kolibri
# Archivo: api/services/kolibri_reader.py (NUEVO)
# Cierra G-06 (KEDAS no lee datos de Kolibri).
# Dependencias: stdlib (csv, pathlib, collections)
# Licencia: AGPL-3.0-or-later
#
# Modo offline-first: lee CSV exportados desde Kolibri admin,
# NO requiere acceso a la API de Kolibri en tiempo real.
# Validado contra CSVs de una prueba técnica offline (abril-mayo 2026).
# ============================================================

import csv
import json
import logging
import os
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger("kedas.kolibri_reader")

KOLIBRI_DATA_PATH = Path(os.getenv("KOLIBRI_DATA_PATH", "/opt/kedas/data/kolibri"))

# Mapeo Kolibri "Nombre del centro educativo" → KEDAS establecimiento_id,
# solo para CSV compartidos en la raíz de KOLIBRI_DATA_PATH. Se define en la
# variable de entorno KOLIBRI_CENTRO_MAPPING (JSON), p. ej.
#   KOLIBRI_CENTRO_MAPPING='{"Nombre del centro en Kolibri": 1}'
# Sin mapeo, cada establecimiento lee solo su carpeta {establecimiento_id}/.
def _cargar_mapeo() -> dict:
    crudo = os.getenv("KOLIBRI_CENTRO_MAPPING", "").strip()
    if not crudo:
        return {}
    try:
        datos = json.loads(crudo)
        return {str(k): int(v) for k, v in datos.items()}
    except (ValueError, TypeError, AttributeError):
        logger.error("KOLIBRI_CENTRO_MAPPING no es un JSON válido; se ignora.")
        return {}


DEFAULT_MAPPING = _cargar_mapeo()


def leer_sesiones_kolibri(establecimiento_id: int) -> Optional[dict]:
    """
    Lee y agrega registros Kolibri para un establecimiento.

    Busca en:
      1. KOLIBRI_DATA_PATH/{establecimiento_id}/{sesiones,resumidos}.csv
      2. KOLIBRI_DATA_PATH/{sesiones,resumidos}.csv (filtrando por centro)

    Retorna dict con métricas agregadas, o None si no hay datos.
    """
    nombre_centro_esperado = None
    for nombre, eid in DEFAULT_MAPPING.items():
        if eid == establecimiento_id:
            nombre_centro_esperado = nombre
            break

    # La raíz compartida solo se lee si hay un nombre de centro para filtrar:
    # sin filtro, un establecimiento vería los registros de todos los demás.
    paths_a_probar = [KOLIBRI_DATA_PATH / str(establecimiento_id)]
    if nombre_centro_esperado:
        paths_a_probar.append(KOLIBRI_DATA_PATH)

    sesiones, resumidos = [], []
    fuente = None

    for base in paths_a_probar:
        if not base.exists():
            continue
        f_ses = base / "sesiones.csv"
        f_res = base / "resumidos.csv"
        if f_ses.exists():
            sesiones = _leer_csv(f_ses, nombre_centro_esperado)
            fuente = str(f_ses)
        if f_res.exists():
            resumidos = _leer_csv(f_res, nombre_centro_esperado)
        if sesiones or resumidos:
            break

    if not sesiones and not resumidos:
        logger.warning(
            "Sin datos Kolibri para establecimiento %s en %s",
            establecimiento_id, KOLIBRI_DATA_PATH
        )
        return None

    return _agregar(establecimiento_id, sesiones, resumidos, fuente)


def _leer_csv(path: Path, filtrar_centro: Optional[str]) -> list:
    """Carga un CSV exportado de Kolibri. Maneja BOM (utf-8-sig)."""
    try:
        with open(path, encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
        if filtrar_centro:
            rows = [r for r in rows if r.get("Nombre del centro educativo") == filtrar_centro]
        return rows
    except Exception as e:
        logger.error("Error leyendo %s: %s", path, e)
        return []


def _seg_to_min(seg) -> float:
    try:
        return float(seg) / 60.0
    except (TypeError, ValueError):
        return 0.0


def _progreso(r) -> float:
    try:
        return float(r.get("Progreso (0-1)", 0))
    except (TypeError, ValueError):
        return 0.0


def _agregar(est_id: int, sesiones: list, resumidos: list, fuente: str) -> dict:
    # Métricas globales
    total_sesiones = len(sesiones)
    usuarios = {r.get("Nombre de usuario") for r in sesiones if r.get("Nombre de usuario")}
    usuarios_activos = len(usuarios)

    tiempo_total_min = sum(
        _seg_to_min(r.get("Tiempo empleado (segundos)", 0)) for r in sesiones
    )
    completados = sum(1 for r in resumidos if _progreso(r) >= 1.0)

    # Agregación por nivel (Folder level 1)
    por_nivel = defaultdict(lambda: {"sesiones": 0, "minutos": 0.0, "completados": 0})
    for r in sesiones:
        nivel = r.get("Folder level 1") or "Sin nivel"
        por_nivel[nivel]["sesiones"] += 1
        por_nivel[nivel]["minutos"] += _seg_to_min(r.get("Tiempo empleado (segundos)", 0))
    for r in resumidos:
        nivel = r.get("Folder level 1") or "Sin nivel"
        if _progreso(r) >= 1.0:
            por_nivel[nivel]["completados"] += 1

    por_nivel_list = [
        {
            "nivel": k,
            "sesiones": v["sesiones"],
            "minutos": round(v["minutos"], 1),
            "completados": v["completados"],
        }
        for k, v in sorted(por_nivel.items())
    ]

    # Canal predominante
    canales = defaultdict(int)
    for r in sesiones:
        canales[r.get("Nombre del canal") or "—"] += 1
    canal_principal = max(canales.items(), key=lambda x: x[1])[0] if canales else None

    # Centro educativo (uniforme tras el filtro)
    centro = (sesiones[0].get("Nombre del centro educativo") if sesiones else
              (resumidos[0].get("Nombre del centro educativo") if resumidos else None))

    return {
        "establecimiento_id": est_id,
        "centro": centro,
        "canal_principal": canal_principal,
        "total_sesiones": total_sesiones,
        "usuarios_activos": usuarios_activos,
        "recursos_completados": completados,
        "tiempo_total_minutos": round(tiempo_total_min, 1),
        "horas_totales": round(tiempo_total_min / 60.0, 2),
        "por_nivel": por_nivel_list,
        "fuente": "registros_kolibri_csv",
        "archivo_fuente": fuente,
        "leido_en": datetime.utcnow().isoformat() + "Z",
    }


# ── Resumen desde la tabla de sesiones (una sola fuente para todas las pantallas) ──
_NOMBRE_ASIGNATURA = {"Matematica": "Matemática", "Lenguaje y Comunicacion": "Lenguaje y Comunicación",
                      "Ciencias Naturales": "Ciencias Naturales",
                      "Historia Geografia y Ciencias Sociales": "Historia, Geografía y Ciencias Sociales"}


async def resumen_sesiones_kolibri(conn, establecimiento_id: int) -> Optional[dict]:
    """Resumen de la actividad de Kolibri del establecimiento desde kedas_sesiones_curriculares.

    Misma estructura que leer_sesiones_kolibri (CSV), para que el inicio y los paneles por rol no cambien.
    Incluye la actividad cargada automáticamente desde Kolibri y la del generador del demo.
    Devuelve None si no hay sesiones o si la tabla no existe en esta instalación.
    """
    try:
        tot = await conn.fetchrow("""
            SELECT COUNT(*) AS sesiones, COUNT(DISTINCT hash_usuario) AS usuarios,
                   COUNT(DISTINCT (hash_usuario, content_id)) FILTER (WHERE progreso >= 1) AS completados,
                   COALESCE(SUM(tiempo_segundos), 0) / 60.0 AS minutos
            FROM kedas_sesiones_curriculares
            WHERE establecimiento_id = $1 AND tipo_usuario = 'Estudiante'
        """, establecimiento_id)
        if not tot or not tot["sesiones"]:
            return None
        niveles = await conn.fetch("""
            SELECT nivel_nombre AS nivel, COUNT(*) AS sesiones,
                   ROUND(COALESCE(SUM(tiempo_segundos), 0) / 60.0, 1) AS minutos,
                   COUNT(DISTINCT (hash_usuario, content_id)) FILTER (WHERE progreso >= 1) AS completados
            FROM kedas_sesiones_curriculares
            WHERE establecimiento_id = $1 AND tipo_usuario = 'Estudiante'
            GROUP BY nivel_nombre ORDER BY nivel_nombre
        """, establecimiento_id)
        asig = await conn.fetchval("""
            SELECT asignatura FROM kedas_sesiones_curriculares
            WHERE establecimiento_id = $1 AND tipo_usuario = 'Estudiante' AND asignatura <> 'Sin OA validado'
            GROUP BY asignatura ORDER BY COUNT(*) DESC LIMIT 1
        """, establecimiento_id)
        centro = await conn.fetchval("SELECT nombre FROM kedas_establecimientos WHERE id = $1", establecimiento_id)
    except Exception as e:  # p. ej., instalación sin la tabla: el inicio sigue funcionando sin la tarjeta
        logger.warning("resumen_sesiones_kolibri est_id=%s: %s", establecimiento_id, e)
        return None
    minutos = float(tot["minutos"] or 0)
    return {
        "establecimiento_id": establecimiento_id,
        "centro": centro,
        "canal_principal": _NOMBRE_ASIGNATURA.get(asig, asig) if asig else None,
        "total_sesiones": tot["sesiones"],
        "usuarios_activos": tot["usuarios"],
        "recursos_completados": tot["completados"],
        "tiempo_total_minutos": round(minutos, 1),
        "horas_totales": round(minutos / 60.0, 2),
        "por_nivel": [{"nivel": r["nivel"], "sesiones": r["sesiones"], "minutos": float(r["minutos"]),
                       "completados": r["completados"]} for r in niveles],
        "fuente": "actividad registrada en KEDAS",
        "archivo_fuente": None,
        "leido_en": datetime.utcnow().isoformat() + "Z",
    }
