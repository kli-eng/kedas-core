-- ============================================================
-- KEDAS v3.2.0 — Fix migración 010: SLEP Costa Pacífico → SLEP Marga Marga
-- Fecha: 12-jun-2026
-- Motivo: Olmué pertenece a Provincia de Marga Marga, V Región.
--         El seed inicial usó un nombre incorrecto.
-- Aplica con:
--   docker exec -i kedas-postgres psql -U kedas -d kedas_db \
--     < migrations/010_fix_slep_marga_marga.sql
-- ============================================================

BEGIN;

UPDATE kedas_slep
SET    nombre = 'SLEP Marga Marga',
       codigo = 'SLEP-MARGA-MARGA'
WHERE  codigo = 'SLEP-COSTA-PACIFICO';

-- Verificación
DO $$
DECLARE
    v_count INT;
    v_nombre VARCHAR;
    v_codigo VARCHAR;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM kedas_slep WHERE codigo = 'SLEP-MARGA-MARGA';

    SELECT nombre, codigo INTO v_nombre, v_codigo
    FROM kedas_slep WHERE codigo = 'SLEP-MARGA-MARGA';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Fix fallido — SLEP-MARGA-MARGA no encontrado. Haciendo rollback.';
    END IF;

    RAISE NOTICE '✓ Fix aplicado correctamente';
    RAISE NOTICE '  nombre : %', v_nombre;
    RAISE NOTICE '  codigo : %', v_codigo;
    RAISE NOTICE '  La FK slep_id en kedas_establecimientos NO requiere cambio (apunta al id, no al codigo).';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK MANUAL (solo si hay que revertir)
-- ============================================================
-- BEGIN;
-- UPDATE kedas_slep
-- SET nombre = 'SLEP Costa Pacífico', codigo = 'SLEP-COSTA-PACIFICO'
-- WHERE codigo = 'SLEP-MARGA-MARGA';
-- COMMIT;
