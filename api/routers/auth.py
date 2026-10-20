# ============================================================
# KEDAS v3.0 — Middleware de Autenticación y Autorización
# Archivo: api/routers/auth.py
# Dependencias: python-jose[cryptography]==3.3.0, passlib[bcrypt]==1.7.4
# Licencias: MIT (python-jose), BSD (passlib)
# ============================================================

import os
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

logger = logging.getLogger("kedas.auth")

# ── Configuración JWT ─────────────────────────────────────────
SECRET_KEY      = os.environ["KEDAS_JWT_SECRET"]       # mínimo 32 caracteres
ALGORITHM       = "HS256"
TOKEN_EXPIRE_H  = int(os.getenv("KEDAS_TOKEN_EXPIRE_HOURS", "8"))

# Contexto de hashing de contraseñas (bcrypt)
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Esquema OAuth2 para extracción del token desde header Authorization: Bearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

router = APIRouter()


# ── Modelos Pydantic ──────────────────────────────────────────
class Token(BaseModel):
    access_token: str
    token_type:   str
    rol:          str
    expires_in:   int    # segundos hasta expiración
    debe_cambiar_password: bool = False   # DEC-73: el token solo sirve para cambiarla
    mfa_requerido: bool = False   # el token solo sirve para /auth/mfa/validar-login
    mfa_registro:  bool = False   # el token solo sirve para configurar el doble factor


class TokenData(BaseModel):
    actor_hash: Optional[str] = None    # hash del usuario autenticado
    rol:        Optional[str] = None    # perfil: docente, utp, orientador, etc.
    establecimiento_id: Optional[int] = None
    user_id:    Optional[int] = None    # id real en kedas_usuarios (para joins)


# ── Roles permitidos en el sistema ───────────────────────────
ROLES_VALIDOS = {
    "docente", "utp", "apoderado", "director",
    "orientador", "psicologo", "coordinador_convivencia", "admin",
    "slep_tecnico"
}

# Permisos por rol: qué recursos puede acceder cada uno
PERMISOS_ROL = {
    "docente":                 {"alertas:leer", "alertas:escribir", "estudiantes:leer"},
    "utp":                     {"alertas:leer", "alertas:escribir", "estudiantes:leer",
                                "reportes:leer", "predicciones:leer"},
    "orientador":              {"convivencia:leer", "convivencia:escribir",
                                "asistencia:leer", "estudiantes:leer"},
    "psicologo":               {"convivencia:leer", "convivencia:escribir",
                                "protocolos:leer", "protocolos:escribir",
                                "asistencia:leer", "estudiantes:leer"},
    "coordinador_convivencia": {"convivencia:leer", "convivencia:escribir", "estudiantes:leer",
                                "reportes:leer", "reportes:escribir",
                                "asistencia:leer"},
    "director":                {"convivencia:leer", "convivencia:escribir",
                                "protocolos:leer", "reportes:leer",
                                "reportes:escribir", "estudiantes:leer",
                                "predicciones:leer", "alertas:leer"},
    "apoderado":               {"consentimientos:leer", "consentimientos:escribir",
                                "progreso_propio:leer"},
    "admin":                   {"*"},  # acceso total (solo para administración del sistema)
    "slep_tecnico":            {"convivencia:leer",        # KPIs agregados por establecimiento
                                "reportes:leer",           # Reportes de cumplimiento SLEP
                                "alertas:leer",            # Tasa alertas vencidas (sin hashes)
                                "slep:administrar"},       # Panel admin SLEP — S5-02
}


def hash_actor_id(user_id: str) -> str:
    """
    Genera el hash del ID de usuario para registros de auditoría.
    Usa el mismo salt del sistema para consistencia con kedas_pseudonimos.
    """
    salt = os.environ.get("KEDAS_PSEUDONIMO_SALT", "")
    return hashlib.sha256(f"{user_id}:{salt}".encode()).hexdigest()[:16]


def verificar_password(plain: str, hashed: str) -> bool:
    """Verifica contraseña usando bcrypt."""
    return pwd_ctx.verify(plain, hashed)


def hashear_password(password: str) -> str:
    """Hashea contraseña con bcrypt para almacenamiento."""
    return pwd_ctx.hash(password)


# ── DEC-73 parte 1 (16-oct-2026): política de contraseñas ─────
# Fuentes: NIST SP 800-63B-4 §3.1.1.2 (mínimo 15 caracteres si la contraseña es el único
# factor; aceptar al menos 64; lista de bloqueo; sin reglas de composición ni cambio
# periódico) y OWASP ASVS 5.0 req. 6.2.1 (15 caracteres fuertemente recomendado).
PASSWORD_MIN = 15
PASSWORD_MAX = 64
BCRYPT_MAX_BYTES = 72          # passlib/bcrypt solo usan los primeros 72 bytes
ALCANCE_CAMBIO = "cambio_password"
TOKEN_CAMBIO_MIN = 10
_PALABRAS_CONTEXTO = ("kedas", "kairos", "kairós")
_RUTA_BLOQUEO = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                             "data", "contrasenas_bloqueadas.txt")
MENSAJE_VENCIDA = ("Su cuenta venció. Si necesita más tiempo, contacte a quien le "
                   "entregó el acceso.")


def _cargar_bloqueo() -> frozenset:
    """Lista local de contraseñas conocidas o filtradas (SecLists, 15+ caracteres).
    Es local a propósito: consultar un servicio externo enviaría datos fuera del servidor."""
    try:
        with open(_RUTA_BLOQUEO, encoding="utf-8") as f:
            return frozenset(l.strip().lower() for l in f if l.strip())
    except OSError:
        logger.error("DEC-73: no se pudo leer la lista de bloqueo en %s", _RUTA_BLOQUEO)
        return frozenset()


_BLOQUEO = _cargar_bloqueo()


def errores_password(password: str, username: str = "") -> list:
    """Devuelve la lista de motivos de rechazo (vacía si la contraseña cumple la política).
    Sin reglas de composición: no se exigen mayúsculas, números ni símbolos (NIST)."""
    errores = []
    if len(password) < PASSWORD_MIN:
        errores.append(f"Debe tener al menos {PASSWORD_MIN} caracteres (tiene {len(password)}).")
    if len(password) > PASSWORD_MAX:
        errores.append(f"Puede tener como máximo {PASSWORD_MAX} caracteres.")
    if len(password.encode("utf-8")) > BCRYPT_MAX_BYTES:
        errores.append("Es demasiado larga para guardarse de forma segura: use una frase más "
                       "corta o con menos letras con tilde.")
    baja = password.lower()
    if not _BLOQUEO:
        # Falla cerrada: sin la lista no se aceptan contraseñas nuevas (el login sigue funcionando).
        errores.append("No se pudo comprobar la contraseña contra la lista de contraseñas "
                       "conocidas. Avise al administrador del sistema.")
    elif baja in _BLOQUEO:
        errores.append("Es una contraseña conocida o filtrada en internet. Elija otra.")
    if len(set(baja)) < 5:
        errores.append("Repite demasiado los mismos caracteres.")
    if username and len(username) >= 3 and username.lower() in baja:
        errores.append("No puede contener su nombre de usuario.")
    if any(p in baja for p in _PALABRAS_CONTEXTO):
        errores.append("No puede contener el nombre del sistema (KEDAS, Kairós).")
    return errores


def validar_password_nueva(password: str, username: str = "") -> None:
    """Lanza HTTP 400 con todos los motivos si la contraseña no cumple la política."""
    errores = errores_password(password, username)
    if errores:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=" ".join(errores))


def crear_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Crea un JWT firmado con HS256.
    El token contiene: actor_hash (no el usuario real), rol y establecimiento_id.
    """
    payload = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(hours=TOKEN_EXPIRE_H)
    )
    payload.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def obtener_usuario_actual(token: str = Depends(oauth2_scheme)) -> TokenData:
    """
    Dependencia FastAPI: extrae y valida el JWT del header Authorization.
    Retorna los datos del token decodificado (sin datos personales).
    """
    excepcion = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas o token expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        actor_hash: str = payload.get("sub")
        rol: str        = payload.get("rol")
        if actor_hash is None or rol not in ROLES_VALIDOS:
            raise excepcion
        if payload.get("alcance"):
            # DEC-73: el token de cambio obligatorio solo sirve en /auth/cambiar-password
            raise excepcion
        return TokenData(
            actor_hash=actor_hash,
            rol=rol,
            establecimiento_id=payload.get("establecimiento_id"),
            user_id=payload.get("user_id")
        )
    except JWTError:
        raise excepcion


def verificar_permiso(permiso: str):
    """
    Factory de dependencias para control de acceso basado en roles (RBAC).
    Uso: Depends(verificar_permiso("convivencia:escribir"))
    """
    async def _check(usuario: TokenData = Depends(obtener_usuario_actual)):
        permisos_usuario = PERMISOS_ROL.get(usuario.rol, set())
        if "*" not in permisos_usuario and permiso not in permisos_usuario:
            logger.warning(
                f"Acceso denegado: actor={usuario.actor_hash}, "
                f"rol={usuario.rol}, permiso_requerido={permiso}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Su perfil '{usuario.rol}' no tiene permiso para esta acción."
            )
        return usuario
    return _check


async def exigir_estudiante_del_establecimiento(conn, usuario, hash_id,
                                               permitir_inexistente=False) -> None:
    """Verifica que el estudiante (hash_id) pertenezca al establecimiento del usuario.
    Responde 404 (no 403) para no revelar si el estudiante existe en otro establecimiento."""
    if usuario.rol == "admin":
        return
    est = await conn.fetchval(
        "SELECT establecimiento_id FROM kedas_pseudonimos WHERE hash_id = $1", hash_id
    )
    if est is None:
        if permitir_inexistente:
            return
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado."
        )
    if usuario.establecimiento_id is None or int(est) != int(usuario.establecimiento_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado."
        )



# ============================================================
# Sección anexada desde auth_patch.py (cierra G-01)
# ============================================================

# ============================================================
# KEDAS v3.0.2 — Patch a api/routers/auth.py
# Cierra G-01 (HTTP 501 → 200 OK). NO reescribe el archivo;
# se APLICA después del bloque existente eliminando primero las
# líneas 156-173 (el endpoint /token que devolvía 501).
#
# Aplicación manual (3 pasos):
#   1. Editar api/routers/auth.py y eliminar las líneas 156-173
#      (el bloque `@router.post("/token", ...)` que lanza HTTP_501).
#   2. Pegar el contenido de este archivo al final de auth.py.
#   3. Reiniciar el servicio API: docker compose restart api
# ============================================================

import asyncpg
import secrets
import json
from fastapi import Header

# El INSTALL_TOKEN protege el bootstrap del admin. Generar con:
#   openssl rand -hex 32
# y exportar como KEDAS_INSTALL_TOKEN en el .env del servicio API.
INSTALL_TOKEN = os.getenv("KEDAS_INSTALL_TOKEN", "")


async def _auth_db():
    """
    Conexión asyncpg dedicada para los endpoints de auth.
    Registra codec jsonb (fix C-53 también aquí por consistencia).
    """
    conn = await asyncpg.connect(os.environ["KEDAS_DATABASE_URL"])
    try:
        await conn.set_type_codec(
            "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
        )
        yield conn
    finally:
        await conn.close()


async def _auditar_auth(conn, actor_hash: str, rol: str, accion: str, resultado: str):
    """DEC-73: auditoría de eventos de credenciales (sin el usuario en claro)."""
    await conn.execute(
        "INSERT INTO kedas_audit_log (actor_id, actor_rol, accion, entidad, resultado) "
        "VALUES ($1, $2, $3, $4, $5)",
        actor_hash, rol, accion, "kedas_usuarios", resultado,
    )


class InitAdminIn(BaseModel):
    username: str
    password: str
    nombre_completo: str
    email: Optional[str] = None


class UsuarioOut(BaseModel):
    id: int
    username: str
    nombre_completo: str
    email: Optional[str] = None
    role: str
    establecimiento_id: Optional[int] = None


# ── Endpoint /token funcional (reemplaza el HTTP 501) ─────────
@router.post("/token", response_model=Token, summary="Obtener token JWT")
@limiter.limit("10/minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    conn: asyncpg.Connection = Depends(_auth_db),
):
    """
    Login OAuth2 password flow. Valida contra kedas_usuarios.
    En el token, `sub` es el hash_actor_id (no el username en claro)
    para alineación con kedas_audit_log y privacidad.
    """
    row = await conn.fetchrow(
        "SELECT id, username, password_hash, role, establecimiento_id, activo, "
        "debe_cambiar_password, vence_en, totp_habilitado "
        "FROM kedas_usuarios WHERE username = $1",
        form_data.username,
    )
    if not row or not row["activo"] or not verificar_password(
        form_data.password, row["password_hash"]
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if row["role"] not in ROLES_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Rol no autorizado"
        )

    actor_hash = hash_actor_id(row["username"])
    ahora = datetime.now(timezone.utc)

    # DEC-73: cuenta con vencimiento. Se informa solo con la contraseña correcta,
    # para no revelar si una cuenta existe.
    if row["vence_en"] is not None and row["vence_en"] <= ahora:
        await _auditar_auth(conn, actor_hash, row["role"], "cuenta_vencida",
                            f"rechazado: vencio={row['vence_en'].isoformat(timespec='minutes')}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=MENSAJE_VENCIDA)

    datos_token = {
        "sub": actor_hash,
        "rol": row["role"],
        "establecimiento_id": row["establecimiento_id"],
        "user_id": row["id"],
    }

    # DEC-73: contraseña fijada por otra persona. Token de 10 minutos que solo sirve
    # para cambiarla: obtener_usuario_actual lo rechaza en todas las demás rutas.
    if row["debe_cambiar_password"]:
        duracion = timedelta(minutes=TOKEN_CAMBIO_MIN)
        if row["vence_en"] is not None:
            duracion = min(duracion, row["vence_en"] - ahora)
        token_cambio = crear_token({**datos_token, "alcance": ALCANCE_CAMBIO}, duracion)
        logger.info("Login con cambio obligatorio: actor=%s rol=%s", actor_hash, row["role"])
        return Token(
            access_token=token_cambio,
            token_type="bearer",
            rol=row["role"],
            expires_in=int(duracion.total_seconds()),
            debe_cambiar_password=True,
        )

    # Segundo factor. Si la cuenta lo exige o lo tiene activo, se entrega un token
    # intermedio que solo sirve para validar el código o configurarlo.
    paso_mfa = await _paso_mfa(conn, row, actor_hash, datos_token, ahora)
    if paso_mfa is not None:
        return paso_mfa

    # DEC-73: el token no dura más que la cuenta
    duracion = timedelta(hours=TOKEN_EXPIRE_H)
    if row["vence_en"] is not None:
        duracion = min(duracion, row["vence_en"] - ahora)
    access_token = crear_token(datos_token, duracion)
    await conn.execute(
        "UPDATE kedas_usuarios SET ultimo_login = NOW() WHERE id = $1", row["id"]
    )
    logger.info(
        "Login OK: actor=%s rol=%s estab=%s",
        actor_hash, row["role"], row["establecimiento_id"]
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        rol=row["role"],
        expires_in=int(duracion.total_seconds()),
    )


# ── DEC-73: cambio de la propia contraseña ────────────────────
class CambiarPasswordIn(BaseModel):
    password_actual: str
    password_nueva: str


async def _usuario_para_cambio(token: str = Depends(oauth2_scheme)) -> TokenData:
    """Acepta el token normal o el de cambio obligatorio. Solo la usa /cambiar-password."""
    excepcion = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas o token expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise excepcion
    if (payload.get("alcance") not in (None, ALCANCE_CAMBIO) or payload.get("sub") is None
            or payload.get("rol") not in ROLES_VALIDOS or payload.get("user_id") is None):
        raise excepcion
    return TokenData(
        actor_hash=payload["sub"],
        rol=payload["rol"],
        establecimiento_id=payload.get("establecimiento_id"),
        user_id=payload["user_id"],
    )


@router.post("/cambiar-password", summary="Cambiar la propia contraseña (DEC-73)")
@limiter.limit("10/minute")
async def cambiar_password(
    request: Request,
    body: CambiarPasswordIn,
    usuario: TokenData = Depends(_usuario_para_cambio),
    conn: asyncpg.Connection = Depends(_auth_db),
):
    """Cambia la contraseña del usuario del token. Pide la contraseña actual, aplica la
    política de DEC-73, quita la marca de cambio obligatorio y lo registra en auditoría."""
    row = await conn.fetchrow(
        "SELECT id, username, password_hash, role, activo, vence_en "
        "FROM kedas_usuarios WHERE id = $1",
        usuario.user_id,
    )
    if not row or not row["activo"] or hash_actor_id(row["username"]) != usuario.actor_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas o token expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if row["vence_en"] is not None and row["vence_en"] <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=MENSAJE_VENCIDA)
    if not verificar_password(body.password_actual, row["password_hash"]):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")
    if body.password_nueva == body.password_actual:
        raise HTTPException(status_code=400,
                            detail="La contraseña nueva debe ser distinta de la actual.")
    validar_password_nueva(body.password_nueva, row["username"])

    await conn.execute(
        "UPDATE kedas_usuarios SET password_hash = $1, debe_cambiar_password = FALSE, "
        "password_cambiado_en = NOW(), updated_at = NOW() WHERE id = $2",
        hashear_password(body.password_nueva), row["id"],
    )
    await _auditar_auth(conn, usuario.actor_hash, row["role"], "password_cambiado", "exito")
    logger.info("Contraseña cambiada: actor=%s", usuario.actor_hash)
    return {"status": "ok",
            "mensaje": "Contraseña actualizada. Inicie sesión con su contraseña nueva."}


# ── Endpoint /init-admin — bootstrap idempotente ──────────────
@router.post(
    "/init-admin",
    response_model=UsuarioOut,
    status_code=201,
    summary="Bootstrap del administrador inicial (solo en instalación)"
)
async def init_admin(
    body: InitAdminIn,
    x_install_token: str = Header(..., alias="X-Install-Token"),
    conn: asyncpg.Connection = Depends(_auth_db),
):
    """
    Crea el administrador inicial. Protegido por X-Install-Token (env
    KEDAS_INSTALL_TOKEN). Falla con 409 si ya existe un admin —
    una sola ejecución exitosa de por vida.
    """
    if not INSTALL_TOKEN or not secrets.compare_digest(
        x_install_token, INSTALL_TOKEN
    ):
        raise HTTPException(status_code=403, detail="Token de instalación inválido")

    existe = await conn.fetchval(
        "SELECT 1 FROM kedas_usuarios WHERE role = 'admin' LIMIT 1"
    )
    if existe:
        raise HTTPException(status_code=409, detail="already_exists")

    validar_password_nueva(body.password, body.username)   # DEC-73

    row = await conn.fetchrow(
        """
        INSERT INTO kedas_usuarios
            (username, password_hash, nombre_completo, email, role, debe_cambiar_password)
        VALUES ($1, $2, $3, $4, 'admin', TRUE)
        RETURNING id, username, nombre_completo, email, role, establecimiento_id
        """,
        body.username, hashear_password(body.password),
        body.nombre_completo, body.email,
    )
    logger.warning(
        "Admin inicial creado vía init-admin: username=%s", body.username
    )
    return UsuarioOut(**dict(row))


# ── Endpoint /me — datos del usuario autenticado ──────────────
@router.get("/me", response_model=UsuarioOut, summary="Datos del usuario actual")
async def me(
    usuario: TokenData = Depends(obtener_usuario_actual),
    conn: asyncpg.Connection = Depends(_auth_db),
):
    """
    Devuelve los datos del usuario asociado al token. Resuelve el
    actor_hash buscando entre los usuarios activos (recálculo del hash).
    [CÓDIGO PENDIENTE — optimización P2]: agregar columna
    username_hash GENERATED ALWAYS AS (...) STORED + índice único
    para evitar el scan secuencial.
    """
    rows = await conn.fetch(
        "SELECT id, username, nombre_completo, email, role, establecimiento_id "
        "FROM kedas_usuarios WHERE activo = TRUE"
    )
    for r in rows:
        if hash_actor_id(r["username"]) == usuario.actor_hash:
            return UsuarioOut(**dict(r))
    raise HTTPException(status_code=404, detail="Usuario del token no encontrado")

# ── MFA / TOTP (B-05) ──────────────────────────────────
# El doble factor se exige en el login para los roles de KEDAS_ROLES_MFA. Flujo: /token con la contraseña correcta entrega un token intermedio con
# alcance "mfa_login" (5 min) o, si la cuenta aún no lo configura, "mfa_registro" (10 min);
# luego /mfa/validar-login, o /mfa/setup + /mfa/verificar, entregan el token normal.
# obtener_usuario_actual rechaza todo token con alcance, así que el intermedio no abre otras
# rutas. Un código no se acepta dos veces (RFC 6238 §5.2) y 5 códigos fallidos seguidos
# bloquean la cuenta 15 minutos (migración 012).
import time, hmac
import pyotp, qrcode, io, base64

ALCANCE_MFA_LOGIN      = "mfa_login"
ALCANCE_MFA_REGISTRO   = "mfa_registro"
TOKEN_MFA_LOGIN_MIN    = 5
TOKEN_MFA_REGISTRO_MIN = 10
MFA_MAX_FALLOS         = 5
MFA_BLOQUEO_MIN        = 15
MFA_EMISOR             = "KEDAS-KLI"
_ROLES_MFA_DEFECTO = "admin,director,slep_tecnico,psicologo,coordinador_convivencia,orientador"
ROLES_SIN_MFA = frozenset({"apoderado"})       # nunca


def _roles_mfa() -> frozenset:
    crudo = os.getenv("KEDAS_ROLES_MFA") or _ROLES_MFA_DEFECTO   # vacía = valor por defecto
    roles = {r.strip() for r in crudo.split(",") if r.strip()}
    desconocidos = roles - ROLES_VALIDOS
    if desconocidos:
        logger.error("KEDAS_ROLES_MFA tiene roles desconocidos %s; se ignoran",
                     sorted(desconocidos))
    return frozenset((roles & ROLES_VALIDOS) - ROLES_SIN_MFA)


# Se lee al iniciar el servicio: cambiar KEDAS_ROLES_MFA exige recrear kedas-api.
ROLES_MFA_REQUERIDO = _roles_mfa()


def _llave_pgcrypto() -> str:
    llave = os.environ.get("KEDAS_PGCRYPTO_KEY", "")
    if len(llave) < 32:
        logger.error("KEDAS_PGCRYPTO_KEY falta o es corta; el doble factor no opera")
        raise HTTPException(status_code=503, detail=(
            "La verificación en dos pasos no está disponible: falta configurar la llave de "
            "cifrado. Avise al administrador del sistema."))
    return llave


async def _paso_mfa(conn, row, actor_hash, datos_token, ahora):
    """Devuelve el Token intermedio si la cuenta debe dar el segundo factor; si no, None."""
    exige  = row["role"] in ROLES_MFA_REQUERIDO
    activo = bool(row["totp_habilitado"]) and row["role"] not in ROLES_SIN_MFA
    if not exige and not activo:
        return None
    alcance, minutos = ((ALCANCE_MFA_LOGIN, TOKEN_MFA_LOGIN_MIN) if activo
                        else (ALCANCE_MFA_REGISTRO, TOKEN_MFA_REGISTRO_MIN))
    duracion = timedelta(minutes=minutos)
    if row["vence_en"] is not None:
        duracion = min(duracion, row["vence_en"] - ahora)
    token = crear_token({**datos_token, "alcance": alcance}, duracion)
    logger.info("Login con segundo factor pendiente (%s): actor=%s", alcance, actor_hash)
    return Token(access_token=token, token_type="bearer", rol=row["role"],
                 expires_in=int(duracion.total_seconds()),
                 mfa_requerido=activo, mfa_registro=not activo)


def _usuario_con_alcance(*permitidos):
    """Dependencia que acepta solo tokens con alguno de los alcances indicados
    (None = token normal). Devuelve el payload del JWT."""
    async def _dep(token: str = Depends(oauth2_scheme)) -> dict:
        excepcion = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas o token expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except JWTError:
            raise excepcion
        if (payload.get("alcance") not in permitidos or payload.get("sub") is None
                or payload.get("rol") not in ROLES_VALIDOS or payload.get("user_id") is None):
            raise excepcion
        return payload
    return _dep


async def _cargar_cuenta(conn, payload):
    row = await conn.fetchrow(
        "SELECT id, username, role, establecimiento_id, activo, vence_en, totp_secret, "
        "totp_habilitado, totp_bloqueado_hasta FROM kedas_usuarios WHERE id = $1",
        payload["user_id"],
    )
    if (not row or not row["activo"] or row["role"] != payload["rol"]
            or hash_actor_id(row["username"]) != payload["sub"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Credenciales inválidas o token expirado",
                            headers={"WWW-Authenticate": "Bearer"})
    if row["vence_en"] is not None and row["vence_en"] <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=MENSAJE_VENCIDA)
    return row


async def _verificar_codigo(conn, row, codigo: str, actor_hash: str, accion: str) -> None:
    """Acepta el código del paso anterior, el actual o el siguiente (±30 s), una sola vez.
    Cuenta los fallos seguidos y bloquea la cuenta al llegar a MFA_MAX_FALLOS."""
    ahora = datetime.now(timezone.utc)
    bloqueo = row["totp_bloqueado_hasta"]
    if bloqueo is not None and bloqueo > ahora:
        await _auditar_auth(conn, actor_hash, row["role"], accion, "rechazado: cuenta bloqueada")
        raise HTTPException(status_code=429, detail=(
            f"Demasiados códigos incorrectos. Espere {MFA_BLOQUEO_MIN} minutos e intente de nuevo."))
    if bloqueo is not None:   # el bloqueo anterior ya venció: se parte de cero
        await conn.execute("UPDATE kedas_usuarios SET totp_fallos = 0, totp_bloqueado_hasta = NULL "
                           "WHERE id = $1", row["id"])

    codigo = (codigo or "").replace(" ", "").strip()
    secreto = await conn.fetchval(
        "SELECT pgp_sym_decrypt(totp_secret::bytea, $1) FROM kedas_usuarios WHERE id = $2",
        _llave_pgcrypto(), row["id"],
    )
    paso = None
    if secreto and len(codigo) == 6 and codigo.isdigit():
        totp = pyotp.TOTP(secreto)
        actual = int(time.time()) // totp.interval
        for p in (actual - 1, actual, actual + 1):
            if hmac.compare_digest(totp.generate_otp(p), codigo):
                paso = p
                break
    if paso is not None:
        aceptado = await conn.fetchval(
            "UPDATE kedas_usuarios SET totp_ultimo_paso = $1, totp_fallos = 0, "
            "totp_bloqueado_hasta = NULL WHERE id = $2 "
            "AND (totp_ultimo_paso IS NULL OR totp_ultimo_paso < $1) RETURNING id",
            paso, row["id"],
        )
        if aceptado:
            return
        motivo = "código ya usado"
    else:
        motivo = "código incorrecto"
    fallos = await conn.fetchval(
        "UPDATE kedas_usuarios SET totp_fallos = totp_fallos + 1, "
        "totp_bloqueado_hasta = CASE WHEN totp_fallos + 1 >= $2 "
        "THEN NOW() + make_interval(mins => $3) ELSE totp_bloqueado_hasta END "
        "WHERE id = $1 RETURNING totp_fallos",
        row["id"], MFA_MAX_FALLOS, MFA_BLOQUEO_MIN,
    )
    await _auditar_auth(conn, actor_hash, row["role"], accion,
                        f"rechazado: {motivo} ({fallos} seguidos)")
    if fallos >= MFA_MAX_FALLOS:
        raise HTTPException(status_code=429, detail=(
            f"Demasiados códigos incorrectos. Espere {MFA_BLOQUEO_MIN} minutos e intente de nuevo."))
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=(
        "Código incorrecto o ya usado. Espere el siguiente código de la app e intente de nuevo."))


async def _token_completo(conn, row) -> Token:
    """Token normal tras validar el segundo factor (mismos datos que /token)."""
    ahora = datetime.now(timezone.utc)
    duracion = timedelta(hours=TOKEN_EXPIRE_H)
    if row["vence_en"] is not None:
        duracion = min(duracion, row["vence_en"] - ahora)
    actor_hash = hash_actor_id(row["username"])
    token = crear_token({"sub": actor_hash, "rol": row["role"],
                         "establecimiento_id": row["establecimiento_id"],
                         "user_id": row["id"]}, duracion)
    await conn.execute("UPDATE kedas_usuarios SET ultimo_login = NOW() WHERE id = $1", row["id"])
    logger.info("Login OK con segundo factor: actor=%s rol=%s estab=%s",
                actor_hash, row["role"], row["establecimiento_id"])
    return Token(access_token=token, token_type="bearer", rol=row["role"],
                 expires_in=int(duracion.total_seconds()))


class MFASetupResponse(BaseModel):
    qr_base64: str
    secret:    str
    mensaje:   str


class MFAVerificarRequest(BaseModel):
    codigo: str


@router.post("/mfa/setup", response_model=MFASetupResponse,
             summary="Genera el QR para configurar el doble factor")
@limiter.limit("10/minute")
async def mfa_setup(
    request: Request,
    payload: dict = Depends(_usuario_con_alcance(None, ALCANCE_MFA_REGISTRO)),
    conn:    asyncpg.Connection = Depends(_auth_db),
):
    """Genera un secreto nuevo solo si el doble factor no está activo. Para cambiar de
    celular hay que pedir que lo restablezcan (POST /admin/usuarios/{id}/reset-mfa)."""
    row = await _cargar_cuenta(conn, payload)
    if row["role"] in ROLES_SIN_MFA:
        raise HTTPException(403, "Este perfil no usa verificación en dos pasos.")
    if row["totp_habilitado"]:
        raise HTTPException(409, (
            "La verificación en dos pasos ya está activa en esta cuenta. Para cambiar de "
            "celular, pida a su director o al administrador que la restablezca."))
    llave  = _llave_pgcrypto()
    secret = pyotp.random_base32()
    await conn.execute(
        "UPDATE kedas_usuarios SET totp_secret = pgp_sym_encrypt($1, $2), "
        "totp_habilitado = FALSE, totp_verificado = FALSE, totp_ultimo_paso = NULL, "
        "totp_fallos = 0, totp_bloqueado_hasta = NULL WHERE id = $3",
        secret, llave, row["id"],
    )
    await _auditar_auth(conn, payload["sub"], row["role"], "mfa_setup", "secreto generado")
    uri = pyotp.TOTP(secret).provisioning_uri(name=row["username"], issuer_name=MFA_EMISOR)
    buf = io.BytesIO()
    qrcode.make(uri).save(buf, format="PNG")
    return MFASetupResponse(
        qr_base64=base64.b64encode(buf.getvalue()).decode(),
        secret=secret,
        mensaje="Escanee el código QR con la app de autenticación y escriba el código de 6 dígitos.",
    )


@router.post("/mfa/verificar", summary="Activa el doble factor con el primer código")
@limiter.limit("10/minute")
async def mfa_verificar(
    request: Request,
    body:    MFAVerificarRequest,
    payload: dict = Depends(_usuario_con_alcance(None, ALCANCE_MFA_REGISTRO)),
    conn:    asyncpg.Connection = Depends(_auth_db),
):
    """Activa el doble factor. Si se llegó desde el login (token de registro), entrega
    además el token normal para entrar."""
    row = await _cargar_cuenta(conn, payload)
    if row["totp_habilitado"]:
        raise HTTPException(409, "La verificación en dos pasos ya está activa en esta cuenta.")
    if not row["totp_secret"]:
        raise HTTPException(400, "Primero genere el código QR (POST /auth/mfa/setup).")
    await _verificar_codigo(conn, row, body.codigo, payload["sub"], "mfa_activar")
    await conn.execute(
        "UPDATE kedas_usuarios SET totp_habilitado = TRUE, totp_verificado = TRUE, "
        "updated_at = NOW() WHERE id = $1", row["id"])
    await _auditar_auth(conn, payload["sub"], row["role"], "mfa_activado", "exito")
    if payload.get("alcance") == ALCANCE_MFA_REGISTRO:
        return await _token_completo(conn, row)
    return {"status": "ok",
            "mensaje": "Verificación en dos pasos activada. Se pedirá en cada ingreso."}


@router.post("/mfa/validar-login", response_model=Token,
             summary="Valida el código del segundo factor y entrega el token")
@limiter.limit("10/minute")
async def mfa_validar_login(
    request: Request,
    body:    MFAVerificarRequest,
    payload: dict = Depends(_usuario_con_alcance(ALCANCE_MFA_LOGIN)),
    conn:    asyncpg.Connection = Depends(_auth_db),
):
    row = await _cargar_cuenta(conn, payload)
    if not row["totp_habilitado"]:
        raise HTTPException(400, "La verificación en dos pasos no está activa en esta cuenta.")
    await _verificar_codigo(conn, row, body.codigo, payload["sub"], "mfa_login")
    await _auditar_auth(conn, payload["sub"], row["role"], "mfa_login", "exito")
    return await _token_completo(conn, row)
