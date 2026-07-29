-- ============================================================
-- KEDAS v3.2.0 — Migración 010: SLEP + REA catalog
-- Fecha: 10-jun-2026
-- Aplica con:
--   docker exec -i kedas-postgres psql -U kedas -d kedas_db \
--     < migrations/010_kedas_slep_rea.sql
-- Rollback: ver sección ROLLBACK al final
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. kedas_slep
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kedas_slep (
    id         BIGSERIAL    PRIMARY KEY,
    nombre     VARCHAR(255) NOT NULL,
    codigo     VARCHAR(64)  UNIQUE NOT NULL,
    region     VARCHAR(128) NOT NULL,
    activo     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed: SLEP Olmué (piloto actual, región V)
INSERT INTO kedas_slep (nombre, codigo, region, activo)
VALUES ('SLEP Costa Pacífico', 'SLEP-COSTA-PACIFICO', 'Valparaíso', TRUE)
ON CONFLICT (codigo) DO NOTHING;

-- ------------------------------------------------------------
-- 2. FK slep_id en kedas_establecimientos
-- ------------------------------------------------------------
ALTER TABLE kedas_establecimientos
    ADD COLUMN IF NOT EXISTS slep_id BIGINT REFERENCES kedas_slep(id);

CREATE INDEX IF NOT EXISTS idx_estab_slep
    ON kedas_establecimientos(slep_id);

-- Vincular establecimiento piloto Olmué (id=3, RBD 1490) al SLEP
UPDATE kedas_establecimientos
SET    slep_id = (SELECT id FROM kedas_slep WHERE codigo = 'SLEP-COSTA-PACIFICO')
WHERE  id = 3;

-- ------------------------------------------------------------
-- 3. kedas_rea
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kedas_rea (
    id                  BIGSERIAL    PRIMARY KEY,
    titulo              VARCHAR(255) NOT NULL,
    descripcion         TEXT,
    establecimiento_id  BIGINT       NOT NULL REFERENCES kedas_establecimientos(id),
    autor_usuario_id    BIGINT       REFERENCES kedas_usuarios(id),
    autor_display       VARCHAR(32)  NOT NULL DEFAULT 'establecimiento'
                        CHECK (autor_display IN ('establecimiento', 'nombre_completo')),
    licencia_cc         VARCHAR(32)  NOT NULL DEFAULT 'CC-BY-4.0'
                        CHECK (licencia_cc IN (
                            'CC-BY-4.0', 'CC-BY-SA-4.0',
                            'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC0-1.0'
                        )),
    nivel_educativo     VARCHAR(64),
    asignatura          VARCHAR(128),
    formato             VARCHAR(32)  DEFAULT 'html5'
                        CHECK (formato IN ('html5', 'scorm', 'pdf', 'video', 'externo')),
    kolibri_content_id  VARCHAR(128),   -- ID en canal Kolibri (nullable)
    url_externa         VARCHAR(512),   -- Fallback si no está en Kolibri (nullable)
    visibilidad         VARCHAR(32)  NOT NULL DEFAULT 'establecimiento'
                        CHECK (visibilidad IN (
                            'privado', 'establecimiento', 'slep', 'publico'
                        )),
    vistas              INT          NOT NULL DEFAULT 0,
    activo              BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Validación: debe tener al menos una fuente de contenido
    CONSTRAINT rea_tiene_fuente CHECK (
        kolibri_content_id IS NOT NULL OR url_externa IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_rea_establecimiento
    ON kedas_rea(establecimiento_id);
CREATE INDEX IF NOT EXISTS idx_rea_visibilidad
    ON kedas_rea(visibilidad);
CREATE INDEX IF NOT EXISTS idx_rea_asignatura
    ON kedas_rea(asignatura);
CREATE INDEX IF NOT EXISTS idx_rea_slep
    ON kedas_rea(establecimiento_id, visibilidad);  -- query frecuente: REA visibles para un SLEP

-- Trigger updated_at (reutiliza fn_set_updated_at que ya existe en el schema)
DROP TRIGGER IF EXISTS trg_rea_updated ON kedas_rea;
CREATE TRIGGER trg_rea_updated
    BEFORE UPDATE ON kedas_rea
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ------------------------------------------------------------
-- 4. kedas_rea_kudos (valoraciones por usuario)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kedas_rea_kudos (
    id          BIGSERIAL   PRIMARY KEY,
    rea_id      BIGINT      NOT NULL REFERENCES kedas_rea(id) ON DELETE CASCADE,
    usuario_id  BIGINT      NOT NULL REFERENCES kedas_usuarios(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rea_id, usuario_id)   -- un kudo por usuario por REA
);

CREATE INDEX IF NOT EXISTS idx_rea_kudos_rea
    ON kedas_rea_kudos(rea_id);

-- ------------------------------------------------------------
-- 5. Verificación post-migración
-- ------------------------------------------------------------
DO $$
DECLARE
    v_slep_count  INT;
    v_rea_exists  BOOLEAN;
    v_kudos_exists BOOLEAN;
    v_fk_exists   BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO v_slep_count FROM kedas_slep;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'kedas_rea'
    ) INTO v_rea_exists;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'kedas_rea_kudos'
    ) INTO v_kudos_exists;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'kedas_establecimientos'
          AND column_name = 'slep_id'
    ) INTO v_fk_exists;

    RAISE NOTICE '--- Migración 010 verificación ---';
    RAISE NOTICE 'kedas_slep rows     : %', v_slep_count;
    RAISE NOTICE 'kedas_rea exists    : %', v_rea_exists;
    RAISE NOTICE 'kedas_rea_kudos     : %', v_kudos_exists;
    RAISE NOTICE 'slep_id FK en estab.: %', v_fk_exists;

    IF NOT (v_rea_exists AND v_kudos_exists AND v_fk_exists AND v_slep_count >= 1) THEN
        RAISE EXCEPTION 'Verificación fallida — haciendo rollback';
    END IF;

    RAISE NOTICE '✓ Migración 010 completada correctamente';
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK MANUAL (ejecutar solo si hay que revertir)
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS kedas_rea_kudos;
-- DROP TABLE IF EXISTS kedas_rea;
-- ALTER TABLE kedas_establecimientos DROP COLUMN IF EXISTS slep_id;
-- DROP TABLE IF EXISTS kedas_slep;
-- COMMIT;
