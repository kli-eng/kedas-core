-- ============================================================
-- KEDAS · Migración 013 · Límite de contraseñas incorrectas por cuenta
-- 1. kedas_usuarios: login_fallos (contraseñas incorrectas seguidas) y login_bloqueado_hasta.
--    10 contraseñas incorrectas seguidas bloquean la cuenta 15 minutos (api/routers/auth.py);
--    restablecer la contraseña levanta el bloqueo (api/routers/admin.py).
-- 2. kedas_audit_log_accion_check: acción nueva login_bloqueado, sin quitar ninguna de las 30 de la 012.
-- Requiere la 012. No modifica datos existentes. Si ya está aplicada, no hace nada.
-- ============================================================
BEGIN;

DO $$
DECLARE def text;
BEGIN
    IF to_regclass('public.kedas_usuarios') IS NULL THEN
        RAISE EXCEPTION 'DETENIDO 013: no existe kedas_usuarios; esquema inesperado';
    END IF;
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conname = 'kedas_audit_log_accion_check';
    IF def IS NULL OR def NOT LIKE '%''mfa_login''%' THEN
        RAISE EXCEPTION 'DETENIDO 013: la restricción de auditoría no es la de la 012';
    END IF;
END $$;

ALTER TABLE kedas_usuarios
    ADD COLUMN IF NOT EXISTS login_fallos          SMALLINT    NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS login_bloqueado_hasta TIMESTAMPTZ;

COMMENT ON COLUMN kedas_usuarios.login_fallos IS
    'Contraseñas incorrectas seguidas; al llegar a 10 la cuenta se bloquea 15 minutos';
COMMENT ON COLUMN kedas_usuarios.login_bloqueado_hasta IS
    'Hasta cuándo se rechaza el ingreso tras 10 contraseñas incorrectas seguidas';

DO $$
BEGIN
    IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conname = 'kedas_audit_log_accion_check') LIKE '%''login_bloqueado''%' THEN
        RAISE NOTICE '013: la acción login_bloqueado ya existe; no se modifica la restricción';
        RETURN;
    END IF;
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
        'mfa_setup', 'mfa_activar', 'mfa_activado', 'mfa_login', 'reset_mfa',
        -- Límite de contraseñas incorrectas (013)
        'login_bloqueado'
    ]::text[]));
END $$;

DO $$
BEGIN
    IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'kedas_usuarios'
        AND column_name IN ('login_fallos', 'login_bloqueado_hasta')) <> 2 THEN
        RAISE EXCEPTION 'DETENIDO 013: faltan columnas tras el ALTER';
    END IF;
    IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conname = 'kedas_audit_log_accion_check') NOT LIKE '%''login_bloqueado''%' THEN
        RAISE EXCEPTION 'DETENIDO 013: falta la acción login_bloqueado';
    END IF;
    RAISE NOTICE 'OK 013: columnas login_fallos y login_bloqueado_hasta, 31 acciones de auditoría';
END $$;

COMMIT;
