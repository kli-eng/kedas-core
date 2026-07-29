-- ============================================================
-- KEDAS v3.0.2 — Migración 004: Tabla de usuarios para login
-- Cierra G-01: el endpoint /api/v1/auth/token devolvía HTTP 501
-- por falta de bootstrap de usuarios. CHECK alineado a ROLES_VALIDOS
-- de api/routers/auth.py líneas 51-54.
-- Aplicar: docker exec -i kedas-postgres psql -U kedas -d kedas_db < 004_kedas_usuarios.sql
-- Idempotente: usa IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS kedas_usuarios (
    id                  BIGSERIAL PRIMARY KEY,
    username            VARCHAR(64) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    nombre_completo     VARCHAR(255) NOT NULL,
    email               VARCHAR(255),
    role                TEXT NOT NULL,
    establecimiento_id  BIGINT REFERENCES kedas_establecimientos(id),
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ultimo_login        TIMESTAMPTZ,
    CONSTRAINT kedas_usuarios_role_check CHECK (role IN (
        'docente', 'utp', 'apoderado', 'director',
        'orientador', 'psicologo', 'coordinador_convivencia', 'admin'
    ))
);

CREATE INDEX IF NOT EXISTS idx_kedas_usuarios_username
    ON kedas_usuarios(username);

CREATE INDEX IF NOT EXISTS idx_kedas_usuarios_est
    ON kedas_usuarios(establecimiento_id);

CREATE INDEX IF NOT EXISTS idx_kedas_usuarios_role
    ON kedas_usuarios(role)
    WHERE activo = TRUE;

-- Trigger para mantener updated_at (función ya definida en kedas_schema.sql)
DROP TRIGGER IF EXISTS trg_usuarios_updated ON kedas_usuarios;
CREATE TRIGGER trg_usuarios_updated
    BEFORE UPDATE ON kedas_usuarios
    FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

COMMENT ON TABLE kedas_usuarios IS
    'Cuentas de acceso a la API. El actor_id que va al kedas_audit_log '
    'es hash_actor_id(username), nunca el username en claro.';

COMMENT ON COLUMN kedas_usuarios.password_hash IS
    'Bcrypt rounds=12, generado con passlib (mismo CryptContext que api/routers/auth.py).';
