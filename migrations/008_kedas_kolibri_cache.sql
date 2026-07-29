-- ============================================================
-- KEDAS v3.1.0 — Migración 008: kedas_kolibri_cache
-- Sprint 2 — B1.1
-- Aplica:
--   docker exec -i kedas-postgres psql -U kedas -d kedas_db \
--     < migrations/008_kedas_kolibri_cache.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS kedas_kolibri_cache (
    establecimiento_id  BIGINT      PRIMARY KEY
                        REFERENCES kedas_establecimientos(id)
                        ON DELETE CASCADE,
    datos               JSONB       NOT NULL,
    actualizado_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kolibri_cache_actualizado
    ON kedas_kolibri_cache(actualizado_at DESC);

COMMENT ON TABLE kedas_kolibri_cache IS
    'Cache de datos Kolibri por establecimiento. '
    'Actualizada cada 6h por cron (POST /api/v1/kolibri/refresh).';
