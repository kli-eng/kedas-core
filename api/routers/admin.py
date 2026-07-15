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
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
import asyncpg

from api.routers.auth import (
    TokenData, verificar_permiso, hashear_password, hash_actor_id,
    ROLES_VALIDOS,
)
from api.routers.estudiantes import get_db

logger = logging.getLogger("kedas.admin")
router = APIRouter()


# ── Modelos ───────────────────────────────────────────────────
class CrearUsuarioIn(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=12,
        description="Mínimo 12 caracteres. Si vienen vacíos, se genera uno aleatorio.")
    nombre_completo: str = Field(..., min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    role: str
    establecimiento_id: Optional[int] = None

    @field_validator("role")
    @classmethod
    def role_valido(cls, v):
        if v not in ROLES_VALIDOS:
            raise ValueError(
                f"Rol inválido. Valores aceptados: {sorted(ROLES_VALIDOS)}"
            )
        return v

    @field_validator("password")
    @classmethod
    def password_seguro(cls, v):
        if len(v) < 12:
            raise ValueError("La contraseña debe tener al menos 12 caracteres")
        return v


class ActualizarUsuarioIn(BaseModel):
    nombre_completo: Optional[str] = Field(None, min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    establecimiento_id: Optional[int] = None
    activo: Optional[bool] = None
    password_nueva: Optional[str] = Field(None, min_length=12)

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

    row = await conn.fetchrow(
        """
        INSERT INTO kedas_usuarios
            (username, password_hash, nombre_completo, email, role, establecimiento_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, username, nombre_completo, email, role,
                  establecimiento_id, activo, created_at, ultimo_login
        """,
        body.username, hashear_password(body.password),
        body.nombre_completo, body.email,
        body.role, body.establecimiento_id,
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
               establecimiento_id, activo, created_at, ultimo_login
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

    for campo, valor in body.model_dump(exclude_unset=True).items():
        if campo == "password_nueva":
            sets.append(f"password_hash = ${idx}")
            params.append(hashear_password(valor))
        else:
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
                  establecimiento_id, activo, created_at, ultimo_login
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

    nueva = secrets.token_urlsafe(16)[:16]
    await conn.execute(
        "UPDATE kedas_usuarios SET password_hash = $1, updated_at = NOW() WHERE id = $2",
        hashear_password(nueva), user_id
    )
    await _audit(conn, usuario, "reset_password", target["username"], "exito")
    return {
        "username": target["username"],
        "password_temporal": nueva,
        "aviso": "Mostrar SOLO una vez. Pedir al usuario que la cambie al primer login.",
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

# ── Panel Admin SLEP — S5-02 ─────────────────────────────────────────────
async def _get_slep_id(conn, establecimiento_id: int) -> int:
    """Retorna el slep_id del establecimiento del técnico SLEP."""
    row = await conn.fetchrow(
        "SELECT slep_id FROM kedas_establecimientos WHERE id = $1",
        establecimiento_id
    )
    if not row or not row["slep_id"]:
        raise HTTPException(400, "El usuario SLEP no tiene SLEP asignado.")
    return row["slep_id"]

@router.get("/slep/establecimientos",
            summary="Listar establecimientos del SLEP (técnico SLEP)")
async def listar_establecimientos_slep(
    usuario: TokenData = Depends(verificar_permiso("slep:administrar")),
    conn:    asyncpg.Connection = Depends(get_db),
):
    if not usuario.establecimiento_id:
        raise HTTPException(403, "Sin establecimiento asignado.")
    slep_id = await _get_slep_id(conn, usuario.establecimiento_id)
    rows = await conn.fetch("""
        SELECT e.id, e.codigo_rbd, e.nombre, e.region,
               e.tipo_contexto, e.ive_institucional,
               e.slep_id, s.nombre AS slep_nombre,
               COUNT(u.id) AS total_usuarios
        FROM kedas_establecimientos e
        LEFT JOIN kedas_slep s ON s.id = e.slep_id
        LEFT JOIN kedas_usuarios u ON u.establecimiento_id = e.id AND u.activo = TRUE
        WHERE e.slep_id = $1
        GROUP BY e.id, s.nombre
        ORDER BY e.nombre
    """, slep_id)
    return [dict(r) for r in rows]


@router.get("/slep/usuarios",
            summary="Listar usuarios de todos los establecimientos del SLEP")
async def listar_usuarios_slep(
    usuario: TokenData = Depends(verificar_permiso("slep:administrar")),
    conn:    asyncpg.Connection = Depends(get_db),
):
    if not usuario.establecimiento_id:
        raise HTTPException(403, "Sin establecimiento asignado.")
    slep_id = await _get_slep_id(conn, usuario.establecimiento_id)
    rows = await conn.fetch("""
        SELECT u.id, u.username, u.nombre_completo, u.email,
               u.role, u.activo, u.ultimo_login,
               u.establecimiento_id, e.nombre AS nombre_establecimiento,
               e.codigo_rbd
        FROM kedas_usuarios u
        JOIN kedas_establecimientos e ON e.id = u.establecimiento_id
        WHERE e.slep_id = $1
        ORDER BY e.nombre, u.role, u.username
    """, slep_id)
    return [dict(r) for r in rows]


class NuevoUsuarioSLEPRequest(BaseModel):
    username:          str
    nombre_completo:   str
    password:          str
    role:              str
    email:             Optional[str] = None
    establecimiento_id: int

ROLES_PERMITIDOS_SLEP = {
    "docente","utp","director","orientador",
    "psicologo","coordinador_convivencia"
}

@router.post("/slep/usuarios",
             summary="Crear usuario en establecimiento del SLEP")
async def crear_usuario_slep(
    body:    NuevoUsuarioSLEPRequest,
    usuario: TokenData = Depends(verificar_permiso("slep:administrar")),
    conn:    asyncpg.Connection = Depends(get_db),
):
    if body.role not in ROLES_PERMITIDOS_SLEP:
        raise HTTPException(400, f"Rol no permitido para técnico SLEP: {body.role}")
    slep_id = await _get_slep_id(conn, usuario.establecimiento_id)
    # Verificar que el establecimiento pertenece al SLEP
    estab = await conn.fetchrow(
        "SELECT slep_id FROM kedas_establecimientos WHERE id = $1",
        body.establecimiento_id
    )
    if not estab or estab["slep_id"] != slep_id:
        raise HTTPException(403, "El establecimiento no pertenece a tu SLEP.")
    # Verificar username único
    existe = await conn.fetchval(
        "SELECT id FROM kedas_usuarios WHERE username = $1", body.username
    )
    if existe:
        raise HTTPException(409, "El nombre de usuario ya existe.")
    import bcrypt
    pwd_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    nuevo_id = await conn.fetchval("""
        INSERT INTO kedas_usuarios
            (username, nombre_completo, email, hashed_password, role, establecimiento_id, activo)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        RETURNING id
    """, body.username, body.nombre_completo, body.email,
        pwd_hash, body.role, body.establecimiento_id)
    return {"id": nuevo_id, "status": "ok",
            "mensaje": f"Usuario {body.username} creado correctamente."}
