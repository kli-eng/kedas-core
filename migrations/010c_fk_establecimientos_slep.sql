-- ============================================================
-- Migracion 010c — FK kedas_establecimientos -> kedas_slep
-- Debe aplicarse DESPUES de 010_kedas_slep_rea.sql (que crea kedas_slep).
-- Separada de 001_schema_fundacional.sql porque kedas_slep no existe
-- en ese punto de la secuencia de instalacion desde cero.
-- ============================================================

DO $$
BEGIN
    ALTER TABLE ONLY public.kedas_establecimientos
    ADD CONSTRAINT kedas_establecimientos_slep_id_fkey FOREIGN KEY (slep_id) REFERENCES public.kedas_slep(id);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK ya existia, se omite (esperado en produccion)';
END $$;
