-- ============================================================
-- Migración 009b — fn_set_updated_at()
--
-- Funcion trigger generica, usada por 010_kedas_slep_rea.sql (trigger
-- trg_rea_updated sobre kedas_rea) y posiblemente otras tablas. Existia
-- en produccion pero nunca quedo en ninguna migracion versionada —
-- mismo patron que actualizar_timestamp() (ver 001_schema_fundacional.sql).
-- Descubierta el 29-jul-2026 al probar una instalacion desde cero (DEC-59).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
