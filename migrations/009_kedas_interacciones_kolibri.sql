-- ============================================================
-- KEDAS v3.1.0 — Migración 009: kedas_interacciones_kolibri
-- Registra interacciones individuales de estudiantes con
-- contenidos Kolibri (ETL desde CSV exportlogs).
-- Sprint 3 — B2: kolibri_extractor.py poblará esta tabla.
-- ============================================================

CREATE TABLE IF NOT EXISTS kedas_interacciones_kolibri (
    id                BIGSERIAL    PRIMARY KEY,
    hash_id           TEXT         NOT NULL,
    session_id        TEXT         NOT NULL,
    content_id        TEXT         NOT NULL,
    content_kind      TEXT         NOT NULL,
    time_spent        INTEGER      NOT NULL,
    complete          BOOLEAN      NOT NULL DEFAULT FALSE,
    mastery_level     NUMERIC(4,3),
    timestamp_inicio  TIMESTAMPTZ  NOT NULL,
    timestamp_fin     TIMESTAMPTZ,
    dua_modal         TEXT
);

CREATE INDEX IF NOT EXISTS idx_interacciones_content
    ON kedas_interacciones_kolibri(content_id, content_kind);

CREATE INDEX IF NOT EXISTS idx_interacciones_hash_ts
    ON kedas_interacciones_kolibri(hash_id, timestamp_inicio DESC);

COMMENT ON TABLE kedas_interacciones_kolibri IS
    'Interacciones individuales con contenidos Kolibri. '
    'Poblada por kolibri_extractor.py (Sprint 3 — Camino B2). '
    'hash_id = pseudónimo del estudiante (Ley 21.719).';
