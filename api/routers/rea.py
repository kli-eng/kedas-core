# ======================================================
# KEDAS v3.2.0 — Router: REA (Recursos Educativos Abiertos)
# Archivo: api/routers/rea.py
# Sprint 2 · Tarea #13 · Gate G4
# ======================================================

import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from api.routers.auth import TokenData, obtener_usuario_actual
from api.routers.estudiantes import get_db

logger = logging.getLogger("kedas.rea")
router = APIRouter()

VISIBILIDADES = {"privado", "establecimiento", "slep", "publico"}
LICENCIAS_CC  = {"CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-NC-4.0", "CC-BY-NC-SA-4.0", "CC0-1.0"}
FORMATOS      = {"html5", "scorm", "pdf", "video", "externo"}
AUTOR_DISPLAY = {"establecimiento", "nombre_completo"}
ROL_ADMIN     = "admin"

class NuevoREARequest(BaseModel):
    titulo:             str           = Field(..., min_length=1, max_length=255)
    descripcion:        Optional[str] = Field(None, max_length=5000)
    establecimiento_id: int           = Field(..., gt=0)
    licencia_cc:        str           = Field("CC-BY-4.0")
    nivel_educativo:    Optional[str] = Field(None, max_length=64)
    asignatura:         Optional[str] = Field(None, max_length=128)
    formato:            str           = Field("html5")
    kolibri_content_id: Optional[str] = Field(None, max_length=128)
    url_externa:        Optional[str] = Field(None, max_length=512)
    visibilidad:        str           = Field("establecimiento")
    autor_display:      str           = Field("establecimiento")

    @field_validator("visibilidad")
    @classmethod
    def validar_visibilidad(cls, v):
        if v not in VISIBILIDADES:
            raise ValueError(f"visibilidad invalida. Opciones: {VISIBILIDADES}")
        return v

    @field_validator("licencia_cc")
    @classmethod
    def validar_licencia(cls, v):
        if v not in LICENCIAS_CC:
            raise ValueError(f"licencia_cc invalida. Opciones: {LICENCIAS_CC}")
        return v

    @field_validator("formato")
    @classmethod
    def validar_formato(cls, v):
        if v not in FORMATOS:
            raise ValueError(f"formato invalido. Opciones: {FORMATOS}")
        return v

    @field_validator("autor_display")
    @classmethod
    def validar_autor_display(cls, v):
        if v not in AUTOR_DISPLAY:
            raise ValueError(f"autor_display invalido. Opciones: {AUTOR_DISPLAY}")
        return v

    @field_validator("url_externa")
    @classmethod
    def validar_fuente(cls, v, info):
        kolibri = info.data.get("kolibri_content_id")
        if not kolibri and not v:
            raise ValueError("Debe indicar kolibri_content_id o url_externa")
        return v

class REAResponse(BaseModel):
    id:                 int
    titulo:             str
    descripcion:        Optional[str]
    establecimiento_id: int
    autor_display:      str
    licencia_cc:        str
    nivel_educativo:    Optional[str]
    asignatura:         Optional[str]
    formato:            str
    kolibri_content_id: Optional[str]
    url_externa:        Optional[str]
    visibilidad:        str
    vistas:             int
    activo:             bool
    created_at:         str
    updated_at:         str

class REAListResponse(BaseModel):
    total: int
    items: List[REAResponse]

def _row_to_rea(row) -> REAResponse:
    return REAResponse(
        id=row["id"], titulo=row["titulo"], descripcion=row["descripcion"],
        establecimiento_id=row["establecimiento_id"], autor_display=row["autor_display"],
        licencia_cc=row["licencia_cc"], nivel_educativo=row["nivel_educativo"],
        asignatura=row["asignatura"], formato=row["formato"],
        kolibri_content_id=row["kolibri_content_id"], url_externa=row["url_externa"],
        visibilidad=row["visibilidad"], vistas=row["vistas"], activo=row["activo"],
        created_at=row["created_at"].isoformat(), updated_at=row["updated_at"].isoformat(),
    )

@router.get("/rea", response_model=REAListResponse, summary="Listar REA accesibles")
async def listar_rea(
    establecimiento_id: Optional[int] = None,
    asignatura:         Optional[str] = None,
    visibilidad:        Optional[str] = None,
    formato:            Optional[str] = None,
    solo_activos:       bool          = True,
    limit:              int           = 50,
    offset:             int           = 0,
    usuario: TokenData  = Depends(obtener_usuario_actual),
    conn                = Depends(get_db),
):
    try:
        conditions = ["r.activo = $1"]
        params: list = [solo_activos]
        idx = 2
        rol = usuario.rol or ""
        if rol in ("docente", "utp", "orientador", "psicologo", "coordinador_convivencia"):
            conditions.append(f"(r.establecimiento_id = ${idx} OR r.visibilidad IN ('slep','publico'))")
            params.append(usuario.establecimiento_id); idx += 1
        elif rol == "director":
            conditions.append(f"r.establecimiento_id IN (SELECT id FROM kedas_establecimientos WHERE slep_id = (SELECT slep_id FROM kedas_establecimientos WHERE id = ${idx}))")
            params.append(usuario.establecimiento_id); idx += 1
        # admin: sin restricción adicional
        if establecimiento_id:
            conditions.append(f"r.establecimiento_id = ${idx}"); params.append(establecimiento_id); idx += 1
        if asignatura:
            conditions.append(f"r.asignatura ILIKE ${idx}"); params.append(f"%{asignatura}%"); idx += 1
        if visibilidad:
            if visibilidad not in VISIBILIDADES:
                raise HTTPException(status_code=400, detail="visibilidad invalida")
            conditions.append(f"r.visibilidad = ${idx}"); params.append(visibilidad); idx += 1
        if formato:
            if formato not in FORMATOS:
                raise HTTPException(status_code=400, detail="formato invalido")
            conditions.append(f"r.formato = ${idx}"); params.append(formato); idx += 1
        where = " AND ".join(conditions)
        count_row = await conn.fetchrow(f"SELECT COUNT(*) AS total FROM kedas_rea r WHERE {where}", *params)
        rows = await conn.fetch(f"SELECT r.* FROM kedas_rea r WHERE {where} ORDER BY r.created_at DESC LIMIT ${idx} OFFSET ${idx+1}", *(params + [limit, offset]))
        return REAListResponse(total=count_row["total"], items=[_row_to_rea(r) for r in rows])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listando REA: {e}")
        raise HTTPException(status_code=500, detail=f"Error interno: {e}")

@router.get("/rea/{rea_id}", response_model=REAResponse, summary="Obtener REA por ID")
async def obtener_rea(
    rea_id: int,
    usuario: TokenData = Depends(obtener_usuario_actual),
    conn               = Depends(get_db),
):
    row = await conn.fetchrow("SELECT * FROM kedas_rea WHERE id = $1 AND activo = TRUE", rea_id)
    if not row:
        raise HTTPException(status_code=404, detail="REA no encontrado")
    await conn.execute("UPDATE kedas_rea SET vistas = vistas + 1 WHERE id = $1", rea_id)
    return _row_to_rea(row)

@router.post("/rea", response_model=REAResponse, status_code=status.HTTP_201_CREATED, summary="Crear REA")
async def crear_rea(
    body:    NuevoREARequest,
    usuario: TokenData = Depends(obtener_usuario_actual),
    conn               = Depends(get_db),
):
    if usuario.rol != ROL_ADMIN and body.establecimiento_id != usuario.establecimiento_id:
        raise HTTPException(status_code=403, detail="No puedes crear REA en otro establecimiento")
    try:
        row = await conn.fetchrow(
            """INSERT INTO kedas_rea (titulo, descripcion, establecimiento_id, autor_usuario_id,
               autor_display, licencia_cc, nivel_educativo, asignatura, formato,
               kolibri_content_id, url_externa, visibilidad)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *""",
            body.titulo, body.descripcion, body.establecimiento_id, None,
            body.autor_display, body.licencia_cc, body.nivel_educativo, body.asignatura,
            body.formato, body.kolibri_content_id, body.url_externa, body.visibilidad,
        )
        logger.info(f"REA creado id={row['id']} actor={usuario.actor_hash}")
        return _row_to_rea(row)
    except Exception as e:
        logger.error(f"Error creando REA: {e}")
        raise HTTPException(status_code=500, detail=f"Error interno: {e}")

@router.patch("/rea/{rea_id}/toggle-autor", response_model=REAResponse, summary="Toggle autor display")
async def toggle_autor_display(
    rea_id: int,
    usuario: TokenData = Depends(obtener_usuario_actual),
    conn               = Depends(get_db),
):
    row = await conn.fetchrow("SELECT * FROM kedas_rea WHERE id = $1 AND activo = TRUE", rea_id)
    if not row:
        raise HTTPException(status_code=404, detail="REA no encontrado")
    nuevo = "nombre_completo" if row["autor_display"] == "establecimiento" else "establecimiento"
    updated = await conn.fetchrow("UPDATE kedas_rea SET autor_display = $1 WHERE id = $2 RETURNING *", nuevo, rea_id)
    return _row_to_rea(updated)

@router.delete("/rea/{rea_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Desactivar REA")
async def desactivar_rea(
    rea_id: int,
    usuario: TokenData = Depends(obtener_usuario_actual),
    conn               = Depends(get_db),
):
    row = await conn.fetchrow("SELECT establecimiento_id FROM kedas_rea WHERE id = $1", rea_id)
    if not row:
        raise HTTPException(status_code=404, detail="REA no encontrado")
    if usuario.rol != ROL_ADMIN and row["establecimiento_id"] != usuario.establecimiento_id:
        raise HTTPException(status_code=403, detail="Sin permiso para desactivar este REA")
    await conn.execute("UPDATE kedas_rea SET activo = FALSE WHERE id = $1", rea_id)
