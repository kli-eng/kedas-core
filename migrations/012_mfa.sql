-- ============================================================
-- KEDAS · Migración 012 · Verificación en dos pasos (TOTP) exigida en el login
-- 0. Extensión pgcrypto (pgp_sym_encrypt / pgp_sym_decrypt): el código de Core la usaba, pero ninguna
--    migración de Core la creaba.
-- 1. kedas_usuarios: columnas del secreto TOTP (el código de autenticación ya las usaba, pero
--    ninguna migración de Core las creaba); un código no se acepta dos veces (RFC 6238 §5.2) y
--    5 códigos fallidos seguidos bloquean la cuenta 15 minutos.
-- 2. kedas_audit_log_accion_check: 5 acciones nuevas (mfa_setup, mfa_activar, mfa_activado,
--    mfa_login, reset_mfa), sin quitar ninguna de las 25 de la 011.
-- Requiere la 011. No modifica datos existentes.
-- ============================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE def text;
BEGIN
    IF to_regclass('public.kedas_usuarios') IS NULL THEN
        RAISE EXCEPTION 'DETENIDO 012: no existe kedas_usuarios; esquema inesperado';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'kedas_usuarios'
                 AND column_name IN ('totp_ultimo_paso', 'totp_fallos', 'totp_bloqueado_hasta')) THEN
        RAISE EXCEPTION 'DETENIDO 012: las columnas ya existen; la migración ya está aplicada';
    END IF;
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conname = 'kedas_audit_log_accion_check';
    IF def IS NULL OR def NOT LIKE '%''cuenta_vencida''%' THEN
        RAISE EXCEPTION 'DETENIDO 012: la restricción de auditoría no es la de la 011';
    END IF;
    IF def LIKE '%''mfa_login''%' THEN
        RAISE EXCEPTION 'DETENIDO 012: la restricción de auditoría ya tiene las acciones de la 012';
    END IF;
END $$;

ALTER TABLE kedas_usuarios
    ADD COLUMN IF NOT EXISTS totp_secret     BYTEA,
    ADD COLUMN IF NOT EXISTS totp_habilitado BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS totp_verificado BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN totp_ultimo_paso     BIGINT,
    ADD COLUMN totp_fallos          SMALLINT    NOT NULL DEFAULT 0,
    ADD COLUMN totp_bloqueado_hasta TIMESTAMPTZ;

COMMENT ON COLUMN kedas_usuarios.totp_secret IS
    'Secreto TOTP cifrado con pgp_sym_encrypt (KEDAS_PGCRYPTO_KEY); NULL = sin configurar';
COMMENT ON COLUMN kedas_usuarios.totp_ultimo_paso IS
    'Último paso de 30 s aceptado (RFC 6238); un código no se acepta dos veces';
COMMENT ON COLUMN kedas_usuarios.totp_fallos IS
    'Códigos fallidos seguidos; al llegar a 5 la cuenta se bloquea 15 minutos';
COMMENT ON COLUMN kedas_usuarios.totp_bloqueado_hasta IS
    'Hasta cuándo se rechazan códigos tras 5 fallos seguidos';

ALTER TABLE kedas_audit_log DROP CONSTRAINT kedas_audit_log_accion_check;
ALTER TABLE kedas_audit_log ADD CONSTRAINT kedas_audit_log_accion_check CHECK (accion = ANY (ARRAY[
    'lectura', 'escritura', 'prediccion', 'exportacion', 'seudonimizacion',
    'consentimiento', 'revocacion', 'alerta_generada', 'alerta_confirmada',
    'alerta_desestimada', 'incidente_registrado', 'protocolo_activado',
    'reporte_generado', 'crear', 'actualizar', 'eliminar', 'login', 'desactivar',
    'reporte', 'vista_dashboard', 'medida_proteccion_registrada',
    'notificacion_apoderado_enviada',
    -- Política de credenciales (011)
    'reset_password', 'password_cambiado', 'cuenta_vencida',
    -- Verificación en dos pasos (012)
    'mfa_setup', 'mfa_activar', 'mfa_activado', 'mfa_login', 'reset_mfa'
]::text[]));

DO $$
BEGIN
    IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'kedas_usuarios'
        AND column_name IN ('totp_secret', 'totp_habilitado', 'totp_verificado',
                            'totp_ultimo_paso', 'totp_fallos', 'totp_bloqueado_hasta')) <> 6 THEN
        RAISE EXCEPTION 'DETENIDO 012: faltan columnas tras el ALTER';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
        RAISE EXCEPTION 'DETENIDO 012: falta la extensión pgcrypto';
    END IF;
    RAISE NOTICE 'OK 012: pgcrypto, columnas TOTP completas y 30 acciones de auditoría';
END $$;

COMMIT;
