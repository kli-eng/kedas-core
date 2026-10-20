# Ctrl+End → pegar → Ctrl+O → Enter → Ctrl+X# ============================================================
# KEDAS v3.1.0 — Router: Administración (CRUD usuarios)
# Archivo: api/routers/admin.py (NUEVO)
# Cierra G-09. Solo accesible con rol "admin" o "director" (este último
# limitado a su propio establecimiento).
# Dependencias: asyncpg, pydantic. Reutiliza hashear_password de auth.py.
# ============================================================

import logging
import secrets
from typing import Optional, List
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
import asyncpg

from api.routers.auth import (
    TokenData, verificar_permiso, hashear_password, hash_actor_id,
    ROLES_VALIDOS, validar_password_nueva,
)
from api.routers.estudiantes import get_db

logger = logging.getLogger("kedas.admin")
router = APIRouter()


def _con_zona_chile(v):
    """DEC-73: una fecha de vencimiento sin zona horaria se interpreta en hora de Chile."""
    if v is not None and v.tzinfo is None:
        return v.replace(tzinfo=ZoneInfo("America/Santiago"))
    return v


# ── Modelos ───────────────────────────────────────────────────
class CrearUsuarioIn(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., max_length=128,
        description="Contraseña inicial. DEC-73: 15 a 64 caracteres; la persona la cambia al primer ingreso.")
    nombre_completo: str = Field(..., min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    role: str
    establecimiento_id: Optional[int] = None
    vence_en: Optional[datetime] = None   # DEC-73: vencimiento de la cuenta (opcional)

    @field_validator("vence_en")
    @classmethod
    def vence_con_zona(cls, v):
        return _con_zona_chile(v)

    @field_validator("role")
    @classmethod
    def role_valido(cls, v):
        if v not in ROLES_VALIDOS:
            raise ValueError(
                f"Rol inválido. Valores aceptados: {sorted(ROLES_VALIDOS)}"
            )
        return v


class ActualizarUsuarioIn(BaseModel):
    nombre_completo: Optional[str] = Field(None, min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    establecimiento_id: Optional[int] = None
    activo: Optional[bool] = None
    vence_en: Optional[datetime] = None   # DEC-73: null quita el vencimiento
    # DEC-73: ya no se acepta (responde 400); la contraseña de otra persona solo se
    # fija con «Restablecer contraseña».
    password_nueva: Optional[str] = None

    @field_validator("vence_en")
    @classmethod
    def vence_con_zona(cls, v):
        return _con_zona_chile(v)

    @field_validator("role")
    @classmethod
    def role_valido(cls, v):
        if v is not None and v not in ROLES_VALIDOS:
            raise ValueError(f"Rol inválido. Valores: {sorted(ROLES_VALIDOS)}")
        return v


class UsuarioOut(BaseModel):
    id: int
    username: str
    nombre_completo: str
    email: Optional[str] = None
    role: str
    establecimiento_id: Optional[int] = None
    activo: bool
    created_at: datetime
    ultimo_login: Optional[datetime] = None
    vence_en: Optional[datetime] = None               # DEC-73
    debe_cambiar_password: Optional[bool] = None      # DEC-73


# ── Helper de autorización ────────────────────────────────────
def _exigir_admin_o_director(usuario: TokenData):
    """Solo admin y director pueden gestionar usuarios."""
    if usuario.rol not in ("admin", "director"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores o directores pueden gestionar usuarios."
        )


def _audit(conn, usuario: TokenData, accion: str, target_username: str, resultado: str):
    """Inserta una fila en kedas_audit_log. Async coroutine."""
    return conn.execute("""
        INSERT INTO kedas_audit_log
            (actor_id, actor_rol, accion, entidad, resultado)
        VALUES ($1, $2, $3, $4, $5)
    """,
        hash_actor_id(usuario.actor_hash), usuario.rol,
        accion, "kedas_usuarios",
        f"{resultado}: target_username={target_username}"
    )


# ── Endpoints ─────────────────────────────────────────────────
@router.post(
    "/usuarios",
    response_model=UsuarioOut,
    status_code=201,
    summary="Crear un usuario (admin/director)"
)
async def crear_usuario(
    body: CrearUsuarioIn,
    usuario: TokenData = Depends(verificar_permiso("estudiantes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Crea un usuario en kedas_usuarios. Reglas:
    - admin puede crear cualquier rol y para cualquier establecimiento.
    - director SOLO puede crear roles distintos de admin, Y SOLO en su
      propio establecimiento.
    """
    _exigir_admin_o_director(usuario)

    if usuario.rol == "director":
        if body.role == "admin":
            raise HTTPException(403, "Un director no puede crear administradores.")
        if body.establecimiento_id != usuario.establecimiento_id:
            raise HTTPException(403, "Un director solo crea usuarios en su establecimiento.")

    # Validar unicidad de username
    existe = await conn.fetchval(
        "SELECT 1 FROM kedas_usuarios WHERE username = $1", body.username
    )
    if existe:
        raise HTTPException(409, f"El username '{body.username}' ya existe.")

    # DEC-73: política de contraseñas y vencimiento
    validar_password_nueva(body.password, body.username)
    if body.vence_en is not None and body.vence_en <= datetime.now(timezone.utc):
        raise HTTPException(400, "La fecha de vencimiento debe ser futura.")

    row = await conn.fetchrow(
        """
        INSERT INTO kedas_usuarios
            (username, password_hash, nombre_completo, email, role, establecimiento_id,
             debe_cambiar_password, vence_en)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
        RETURNING id, username, nombre_completo, email, role,
                  establecimiento_id, activo, created_at, ultimo_login,
                  vence_en, debe_cambiar_password
        """,
        body.username, hashear_password(body.password),
        body.nombre_completo, body.email,
        body.role, body.establecimiento_id, body.vence_en,
    )
    await _audit(conn, usuario, "crear", body.username, "exito")
    logger.info("Usuario creado: %s rol=%s por actor=%s",
                body.username, body.role, hash_actor_id(usuario.actor_hash))
    return UsuarioOut(**dict(row))


@router.get(
    "/usuarios",
    response_model=List[UsuarioOut],
    summary="Listar usuarios (admin/director)"
)
async def listar_usuarios(
    incluir_inactivos: bool = False,
    rol_filtro: Optional[str] = None,
    usuario: TokenData = Depends(verificar_permiso("estudiantes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Lista usuarios. Director ve solo los de su establecimiento."""
    _exigir_admin_o_director(usuario)

    where = []
    params = []
    idx = 1

    if not incluir_inactivos:
        where.append("activo = TRUE")

    if rol_filtro:
        if rol_filtro not in ROLES_VALIDOS:
            raise HTTPException(400, "Rol inválido para filtro")
        where.append(f"role = ${idx}")
        params.append(rol_filtro)
        idx += 1

    if usuario.rol == "director":
        where.append(f"establecimiento_id = ${idx}")
        params.append(usuario.establecimiento_id)
        idx += 1

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    rows = await conn.fetch(f"""
        SELECT id, username, nombre_completo, email, role,
               establecimiento_id, activo, created_at, ultimo_login,
               vence_en, debe_cambiar_password
        FROM kedas_usuarios
        {where_sql}
        ORDER BY role, username
    """, *params)

    return [UsuarioOut(**dict(r)) for r in rows]


@router.patch(
    "/usuarios/{user_id}",
    response_model=UsuarioOut,
    summary="Actualizar usuario (rol, password, activo, etc.)"
)
async def actualizar_usuario(
    user_id: int,
    body: ActualizarUsuarioIn,
    usuario: TokenData = Depends(verificar_permiso("estudiantes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Patch parcial. Solo los campos provistos se actualizan."""
    _exigir_admin_o_director(usuario)

    target = await conn.fetchrow(
        "SELECT username, role, establecimiento_id FROM kedas_usuarios WHERE id = $1",
        user_id
    )
    if not target:
        raise HTTPException(404, "Usuario no encontrado.")

    # Director: no puede tocar admins ni usuarios de otros establecimientos
    if usuario.rol == "director":
        if target["role"] == "admin":
            raise HTTPException(403, "Un director no puede modificar administradores.")
        if target["establecimiento_id"] != usuario.establecimiento_id:
            raise HTTPException(403, "Usuario fuera del establecimiento del director.")
        if body.role == "admin":
            raise HTTPException(403, "Un director no puede asignar rol admin.")

    # Construir UPDATE dinámico
    sets = []
    params = []
    idx = 1

    cambios = body.model_dump(exclude_unset=True)
    # DEC-73: la contraseña de otra persona solo se fija con «Restablecer contraseña»
    if "password_nueva" in cambios:
        raise HTTPException(400, "Para cambiar la contraseña de otra persona use «Restablecer "
                                 "contraseña»: genera una temporal y obliga a cambiarla al ingresar.")
    if cambios.get("vence_en") is not None and cambios["vence_en"] <= datetime.now(timezone.utc):
        raise HTTPException(400, "La fecha de vencimiento debe ser futura.")

    for campo, valor in cambios.items():
        sets.append(f"{campo} = ${idx}")
        params.append(valor)
        idx += 1

    if not sets:
        raise HTTPException(400, "Sin cambios.")

    params.append(user_id)
    row = await conn.fetchrow(f"""
        UPDATE kedas_usuarios
        SET {', '.join(sets)}, updated_at = NOW()
        WHERE id = ${idx}
        RETURNING id, username, nombre_completo, email, role,
                  establecimiento_id, activo, created_at, ultimo_login,
                  vence_en, debe_cambiar_password
    """, *params)

    await _audit(conn, usuario, "actualizar", target["username"],
                 f"campos={list(body.model_dump(exclude_unset=True).keys())}")
    return UsuarioOut(**dict(row))


@router.delete(
    "/usuarios/{user_id}",
    status_code=204,
    summary="Desactivar usuario (soft delete)"
)
async def desactivar_usuario(
    user_id: int,
    usuario: TokenData = Depends(verificar_permiso("estudiantes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Soft delete: marca activo=FALSE. No borra para preservar trazabilidad
    en kedas_audit_log (FK implícita por actor_id hash).
    """
    _exigir_admin_o_director(usuario)

    target = await conn.fetchrow(
        "SELECT username, role, establecimiento_id FROM kedas_usuarios WHERE id = $1",
        user_id
    )
    if not target:
        raise HTTPException(404, "Usuario no encontrado.")

    if usuario.rol == "director" and (
        target["role"] == "admin" or
        target["establecimiento_id"] != usuario.establecimiento_id
    ):
        raise HTTPException(403, "No autorizado para desactivar este usuario.")

    await conn.execute(
        "UPDATE kedas_usuarios SET activo = FALSE, updated_at = NOW() WHERE id = $1",
        user_id
    )
    await _audit(conn, usuario, "desactivar", target["username"], "exito")
    return None


@router.post(
    "/usuarios/{user_id}/reset-password",
    summary="Resetear password con nueva contraseña aleatoria"
)
async def reset_password(
    user_id: int,
    usuario: TokenData = Depends(verificar_permiso("estudiantes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Genera contraseña aleatoria de 16 chars. Se retorna UNA SOLA VEZ."""
    _exigir_admin_o_director(usuario)

    target = await conn.fetchrow(
        "SELECT username, role, establecimiento_id FROM kedas_usuarios WHERE id = $1",
        user_id
    )
    if not target:
        raise HTTPException(404, "Usuario no encontrado.")

    if usuario.rol == "director" and (
        target["role"] == "admin" or
        target["establecimiento_id"] != usuario.establecimiento_id
    ):
        raise HTTPException(403, "No autorizado.")

    nueva = secrets.token_urlsafe(15)   # DEC-73: 20 caracteres aleatorios
    await conn.execute(
        "UPDATE kedas_usuarios SET password_hash = $1, debe_cambiar_password = TRUE, "
        "updated_at = NOW() WHERE id = $2",
        hashear_password(nueva), user_id
    )
    await _audit(conn, usuario, "reset_password", target["username"], "exito")
    return {
        "username": target["username"],
        "password_temporal": nueva,
        "aviso": "Mostrar SOLO una vez. La persona deberá cambiarla al ingresar (DEC-73).",
    }


@router.post(
    "/usuarios/{user_id}/reset-mfa",
    summary="Restablecer la verificación en dos pasos"
)
async def reset_mfa(
    user_id: int,
    usuario: TokenData = Depends(verificar_permiso("estudiantes:leer")),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Borra el secreto TOTP de otra cuenta (celular perdido o cambiado). En su próximo
    ingreso la persona vuelve a configurarlo. Nadie puede restablecer el propio, y un
    director solo restablece cuentas de su establecimiento que no sean admin."""
    _exigir_admin_o_director(usuario)
    if usuario.user_id is not None and int(usuario.user_id) == int(user_id):
        raise HTTPException(403, "No puede restablecer su propia verificación en dos pasos; "
                                 "pídalo a otra persona autorizada.")
    target = await conn.fetchrow(
        "SELECT username, role, establecimiento_id FROM kedas_usuarios WHERE id = $1",
        user_id
    )
    if not target:
        raise HTTPException(404, "Usuario no encontrado.")
    if usuario.rol == "director" and (
        target["role"] == "admin" or
        target["establecimiento_id"] != usuario.establecimiento_id
    ):
        raise HTTPException(403, "No autorizado.")
    await conn.execute(
        "UPDATE kedas_usuarios SET totp_secret = NULL, totp_habilitado = FALSE, "
        "totp_verificado = FALSE, totp_ultimo_paso = NULL, totp_fallos = 0, "
        "totp_bloqueado_hasta = NULL, updated_at = NOW() WHERE id = $1",
        user_id
    )
    await _audit(conn, usuario, "reset_mfa", target["username"], "exito")
    return {
        "username": target["username"],
        "mensaje": "Verificación en dos pasos restablecida. En su próximo ingreso la persona "
                   "la configurará de nuevo con su celular.",
    }


# ============================================================
# KEDAS v3.2.0 — Patch admin.py
# Agregar AL FINAL de /opt/kedas/kedas/api/routers/admin.py
# ============================================================

# — Modelos Pydantic establecimientos —

class EstablecimientoOut(BaseModel):
    id:                int
    codigo_rbd:        str
    nombre:            str
    region:            str
    tipo_contexto:     str
    ive_institucional: Optional[float] = None
    slep_id:           Optional[int]   = None
    created_at:        datetime

class EstablecimientoCreate(BaseModel):
    codigo_rbd:        str = Field(..., min_length=1, max_length=64,
                                   description="RBD único del establecimiento")
    nombre:            str = Field(..., min_length=2, max_length=255)
    region:            str = Field(..., min_length=2, max_length=128)
    tipo_contexto:     str = Field(..., description="urbano o rural")
    ive_institucional: Optional[float] = Field(None, ge=0, le=100)
    slep_id:           Optional[int]   = None

    @field_validator("tipo_contexto")
    @classmethod
    def validar_tipo(cls, v):
        if v not in ("urbano", "rural"):
            raise ValueError("tipo_contexto debe ser 'urbano' o 'rural'")
        return v

class EstablecimientoUpdate(BaseModel):
    nombre:            Optional[str]   = Field(None, min_length=2, max_length=255)
    region:            Optional[str]   = Field(None, min_length=2, max_length=128)
    tipo_contexto:     Optional[str]   = None
    ive_institucional: Optional[float] = Field(None, ge=0, le=100)
    slep_id:           Optional[int]   = None

    @field_validator("tipo_contexto")
    @classmethod
    def validar_tipo(cls, v):
        if v is not None and v not in ("urbano", "rural"):
            raise ValueError("tipo_contexto debe ser 'urbano' o 'rural'")
        return v


# — Endpoints establecimientos —

@router.get(
    "/establecimientos",
    response_model=List[EstablecimientoOut],
    summary="Listar todos los establecimientos (admin)"
)
async def listar_establecimientos(
    usuario: TokenData = Depends(verificar_permiso("admin:*")),
    conn: asyncpg.Connection = Depends(get_db)
):
    rows = await conn.fetch("""
        SELECT id, codigo_rbd, nombre, region, tipo_contexto,
               ive_institucional, slep_id, created_at
        FROM kedas_establecimientos
        ORDER BY nombre ASC
    """)
    return [EstablecimientoOut(**dict(r)) for r in rows]


@router.post(
    "/establecimientos",
    response_model=EstablecimientoOut,
    status_code=201,
    summary="Crear nuevo establecimiento (admin)"
)
async def crear_establecimiento(
    body: EstablecimientoCreate,
    usuario: TokenData = Depends(verificar_permiso("admin:*")),
    conn: asyncpg.Connection = Depends(get_db)
):
    try:
        row = await conn.fetchrow("""
            INSERT INTO kedas_establecimientos
                (codigo_rbd, nombre, region, tipo_contexto, ive_institucional, slep_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, codigo_rbd, nombre, region, tipo_contexto,
                      ive_institucional, slep_id, created_at
        """,
            body.codigo_rbd, body.nombre, body.region,
            body.tipo_contexto, body.ive_institucional, body.slep_id
        )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409,
                detail=f"Ya existe un establecimiento con RBD '{body.codigo_rbd}'")
        raise HTTPException(status_code=500, detail=str(e))
    return EstablecimientoOut(**dict(row))


@router.patch(
    "/establecimientos/{estab_id}",
    response_model=EstablecimientoOut,
    summary="Actualizar establecimiento (admin)"
)
async def actualizar_establecimiento(
    estab_id: int,
    body: EstablecimientoUpdate,
    usuario: TokenData = Depends(verificar_permiso("admin:*")),
    conn: asyncpg.Connection = Depends(get_db)
):
    campos = body.model_dump(exclude_unset=True)
    if not campos:
        raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar")

    sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(campos))
    valores = list(campos.values())

    row = await conn.fetchrow(f"""
        UPDATE kedas_establecimientos
        SET {sets}
        WHERE id = $1
        RETURNING id, codigo_rbd, nombre, region, tipo_contexto,
                  ive_institucional, slep_id, created_at
    """, estab_id, *valores)

    if not row:
        raise HTTPException(status_code=404, detail="Establecimiento no encontrado")
    return EstablecimientoOut(**dict(row))
