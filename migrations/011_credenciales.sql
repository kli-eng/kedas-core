-- ============================================================
-- KEDAS Core — Migración 011: política de credenciales
-- Archivo: migrations/011_credenciales.sql
-- Fecha: 16-oct-2026 · Módulo: transversal (autenticación, Core)
--
-- Qué hace:
--   1. kedas_usuarios: debe_cambiar_password, password_cambiado_en y vence_en.
--   2. kedas_audit_log_accion_check: agrega 'reset_password' (admin.py ya la
--      usa al restablecer contraseñas), 'password_cambiado' y 'cuenta_vencida'.
--
-- Qué NO hace: no marca cuentas existentes ni cambia contraseñas.
--
-- Protección: se detiene sin cambiar nada si (a) alguna columna ya existe,
-- (b) la restricción de auditoría no tiene exactamente las 22 acciones
-- definidas en 001_schema_fundacional.sql, o (c) hay filas de auditoría con
-- acciones fuera de la lista nueva.
--
-- Fuentes: NIST SP 800-63B-4 §3.1.1.2 (cambio forzado ante compromiso);
-- OWASP ASVS 4.0 req. 2.3.1 (contraseñas iniciales no quedan como definitivas);
-- esquema de 001_schema_fundacional.sql y 004_kedas_usuarios.sql.
-- ============================================================

BEGIN;

DO $$
DECLARE
    v_def   text;
    v_n     int;
BEGIN
    -- (a) Columnas nuevas no deben existir
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'kedas_usuarios'
          AND column_name IN ('debe_cambiar_password', 'password_cambiado_en', 'vence_en')
    ) THEN
        RAISE EXCEPTION 'DETENIDO: kedas_usuarios ya tiene alguna columna de DEC-73; la migración parece aplicada';
    END IF;

    -- (b) La restricción de auditoría debe ser la verificada (22 acciones)
    SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint WHERE conname = 'kedas_audit_log_accion_check';
    IF v_def IS NULL THEN
        RAISE EXCEPTION 'DETENIDO: no existe kedas_audit_log_accion_check';
    END IF;
    SELECT count(*) INTO v_n FROM regexp_matches(v_def, '''[a-z_]+''::text', 'g');
    IF v_n <> 22 OR v_def LIKE '%reset_password%' OR v_def LIKE '%password_cambiado%' THEN
        RAISE EXCEPTION 'DETENIDO: la restricción de auditoría no es la esperada (% acciones)', v_n;
    END IF;
END $$;

-- 1. Columnas de credenciales
ALTER TABLE kedas_usuarios
    ADD COLUMN debe_cambiar_password BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN password_cambiado_en  TIMESTAMPTZ,
    ADD COLUMN vence_en              TIMESTAMPTZ;

COMMENT ON COLUMN kedas_usuarios.debe_cambiar_password IS
    'DEC-73: la cuenta solo puede cambiar su contraseña hasta que la cambie (contraseña fijada por otra persona).';
COMMENT ON COLUMN kedas_usuarios.password_cambiado_en IS
    'DEC-73: último cambio de contraseña hecho por el propio usuario.';
COMMENT ON COLUMN kedas_usuarios.vence_en IS
    'DEC-73: fecha y hora en que la cuenta deja de poder iniciar sesión. NULL = sin vencimiento.';

-- 2. Acciones de auditoría (lista de 001_schema_fundacional.sql + 3 nuevas)
ALTER TABLE kedas_audit_log DROP CONSTRAINT kedas_audit_log_accion_check;
ALTER TABLE kedas_audit_log ADD CONSTRAINT kedas_audit_log_accion_check CHECK (accion = ANY (ARRAY[
    'lectura', 'escritura', 'prediccion', 'exportacion', 'seudonimizacion',
    'consentimiento', 'revocacion', 'alerta_generada', 'alerta_confirmada',
    'alerta_desestimada', 'incidente_registrado', 'protocolo_activado',
    'reporte_generado', 'crear', 'actualizar', 'eliminar', 'login', 'desactivar',
    'reporte', 'vista_dashboard', 'medida_proteccion_registrada',
    'notificacion_apoderado_enviada',
    -- Política de credenciales
    'reset_password', 'password_cambiado', 'cuenta_vencida'
]::text[]));

-- Verificación final dentro de la transacción
DO $$
BEGIN
    IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'kedas_usuarios'
          AND column_name IN ('debe_cambiar_password', 'password_cambiado_en', 'vence_en')) <> 3 THEN
        RAISE EXCEPTION 'DETENIDO: faltan columnas tras el ALTER';
    END IF;
    IF EXISTS (SELECT 1 FROM kedas_usuarios WHERE debe_cambiar_password) THEN
        RAISE EXCEPTION 'DETENIDO: hay cuentas marcadas; no debería haber ninguna';
    END IF;
    RAISE NOTICE 'OK 011: 3 columnas nuevas, 25 acciones de auditoría, 0 cuentas marcadas';
END $$;

COMMIT;
