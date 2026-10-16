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
        "debe_cambiar_password, vence_en "
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

# ── MFA / TOTP (B-05) ─────────────────────────────────────────────────────
import pyotp, qrcode, io, base64

ROLES_MFA_REQUERIDO = {"admin", "director", "slep_tecnico"}


class MFASetupResponse(BaseModel):
    qr_base64: str
    secret:    str
    mensaje:   str


class MFAVerificarRequest(BaseModel):
    codigo: str


async def _buscar_usuario_por_hash(conn, actor_hash: str):
    """Retorna (id, username, row) buscando por actor_hash recalculado."""
    rows = await conn.fetch(
        "SELECT id, username, totp_secret, totp_habilitado, totp_verificado "
        "FROM kedas_usuarios WHERE activo=TRUE"
    )
    for r in rows:
        if hash_actor_id(r["username"]) == actor_hash:
            return r
    return None


@router.post("/mfa/setup", response_model=MFASetupResponse,
             summary="Genera QR TOTP para activar MFA")
async def mfa_setup(
    usuario: TokenData = Depends(obtener_usuario_actual),
    conn:    asyncpg.Connection = Depends(_auth_db),
):
    """Genera un secreto TOTP y devuelve el QR en base64 para escanear
    con Google Authenticator, Authy o Microsoft Authenticator."""
    row = await _buscar_usuario_por_hash(conn, usuario.actor_hash)
    if not row:
        raise HTTPException(404, "Usuario no encontrado")

    llave  = os.environ.get("KEDAS_PGCRYPTO_KEY", "")
    secret = pyotp.random_base32()

    await conn.execute(
        "UPDATE kedas_usuarios "
        "SET totp_secret=pgp_sym_encrypt($1, $2), "
        "totp_habilitado=FALSE, totp_verificado=FALSE "
        "WHERE id=$3",
        secret, llave, row["id"]
    )

    totp  = pyotp.TOTP(secret)
    uri   = totp.provisioning_uri(name=row["username"], issuer_name="KEDAS-KLI")
    img   = qrcode.make(uri)
    buf   = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    return MFASetupResponse(
        qr_base64=qr_b64,
        secret=secret,
        mensaje="Escanea el QR con Google Authenticator o Authy. Luego verifica con POST /auth/mfa/verificar"
    )


@router.post("/mfa/verificar", summary="Verifica código TOTP y activa MFA")
async def mfa_verificar(
    body:    MFAVerificarRequest,
    usuario: TokenData = Depends(obtener_usuario_actual),
    conn:    asyncpg.Connection = Depends(_auth_db),
):
    """Verifica el código de 6 dígitos y activa MFA en la cuenta."""
    llave = os.environ.get("KEDAS_PGCRYPTO_KEY", "")
    row   = await _buscar_usuario_por_hash(conn, usuario.actor_hash)
    if not row or not row["totp_secret"]:
        raise HTTPException(400, "MFA no configurado. Ejecuta primero POST /auth/mfa/setup")

    secret_plain = await conn.fetchval(
        "SELECT pgp_sym_decrypt(totp_secret::bytea, $1) "
        "FROM kedas_usuarios WHERE id=$2",
        llave, row["id"]
    )
    totp  = pyotp.TOTP(secret_plain)
    valid = totp.verify(body.codigo, valid_window=1)
    if not valid:
        raise HTTPException(400, "Código incorrecto o expirado. Intenta de nuevo.")

    await conn.execute(
        "UPDATE kedas_usuarios "
        "SET totp_habilitado=TRUE, totp_verificado=TRUE WHERE id=$1",
        row["id"]
    )
    return {"status": "ok",
            "mensaje": "MFA activado correctamente. Se requerirá en el próximo login."}


@router.post("/mfa/validar-login", summary="Valida código TOTP durante el login (segundo factor)")
async def mfa_validar_login(
    body:    MFAVerificarRequest,
    usuario: TokenData = Depends(obtener_usuario_actual),
    conn:    asyncpg.Connection = Depends(_auth_db),
):
    """Valida el segundo factor después del login con contraseña."""
    llave = os.environ.get("KEDAS_PGCRYPTO_KEY", "")
    row   = await _buscar_usuario_por_hash(conn, usuario.actor_hash)
    if not row or not row["totp_habilitado"]:
        raise HTTPException(400, "MFA no está habilitado en esta cuenta.")

    secret_plain = await conn.fetchval(
        "SELECT pgp_sym_decrypt(totp_secret::bytea, $1) "
        "FROM kedas_usuarios WHERE id=$2",
        llave, row["id"]
    )
    totp  = pyotp.TOTP(secret_plain)
    valid = totp.verify(body.codigo, valid_window=1)
    if not valid:
        raise HTTPException(401, "Código MFA incorrecto o expirado.")

    return {"status": "ok", "mfa_validado": True,
            "mensaje": "Segundo factor validado correctamente."}
