-- ============================================================
-- Migración fundacional CORE — subconjunto de 001_schema_fundacional.sql
-- (repo Premium) con solo las 7 tablas que kedas-core necesita.
-- Generada 29-jul-2026 (DEC-59), filtrando el archivo ya validado en
-- Premium -- no transcrita a mano.
-- ============================================================

BEGIN;

-- ── Secuencias ──────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.kedas_establecimientos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.kedas_cursos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.kedas_asistencia_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.kedas_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.kedas_kolibri_online_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.kedas_kolibri_online_resumido_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.kedas_kolibri_online_resumido_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ── Tablas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kedas_establecimientos (
    id bigint NOT NULL,
    codigo_rbd text NOT NULL,
    nombre text NOT NULL,
    region text NOT NULL,
    tipo_contexto text DEFAULT 'urbano'::text NOT NULL,
    ive_institucional numeric(5,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    slep_id bigint,
    CONSTRAINT kedas_establecimientos_tipo_contexto_check CHECK ((tipo_contexto = ANY (ARRAY['urbano'::text, 'rural'::text])))
);
CREATE TABLE IF NOT EXISTS public.kedas_cursos (
    id bigint NOT NULL,
    establecimiento_id bigint NOT NULL,
    nombre text NOT NULL,
    nivel text NOT NULL,
    anno_escolar integer NOT NULL,
    docente_jefe_hash text
);
CREATE TABLE IF NOT EXISTS public.kedas_pseudonimos (
    hash_id text NOT NULL,
    datos_cifrados bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    establecimiento_id bigint
);
CREATE TABLE IF NOT EXISTS public.kedas_asistencia (
    id bigint NOT NULL,
    hash_id text NOT NULL,
    curso_id bigint,
    fecha date NOT NULL,
    estado text NOT NULL,
    semaforo text,
    CONSTRAINT kedas_asistencia_estado_check CHECK ((estado = ANY (ARRAY['presente'::text, 'ausente_justificado'::text, 'ausente_injustificado'::text, 'tardanza'::text]))),
    CONSTRAINT kedas_asistencia_semaforo_check CHECK ((semaforo = ANY (ARRAY['verde'::text, 'amarillo'::text, 'rojo'::text])))
);
CREATE TABLE IF NOT EXISTS public.kedas_audit_log (
    id bigint NOT NULL,
    timestamp_utc timestamp with time zone DEFAULT now() NOT NULL,
    actor_id text NOT NULL,
    actor_rol text NOT NULL,
    accion text NOT NULL,
    entidad text NOT NULL,
    hash_estudiante text,
    ip_origen inet,
    resultado text NOT NULL,
    CONSTRAINT kedas_audit_log_accion_check CHECK ((accion = ANY (ARRAY['lectura'::text, 'escritura'::text, 'prediccion'::text, 'exportacion'::text, 'seudonimizacion'::text, 'consentimiento'::text, 'revocacion'::text, 'alerta_generada'::text, 'alerta_confirmada'::text, 'alerta_desestimada'::text, 'incidente_registrado'::text, 'protocolo_activado'::text, 'reporte_generado'::text, 'crear'::text, 'actualizar'::text, 'eliminar'::text, 'login'::text, 'desactivar'::text, 'reporte'::text, 'vista_dashboard'::text, 'medida_proteccion_registrada'::text, 'notificacion_apoderado_enviada'::text]))),
    CONSTRAINT kedas_audit_log_actor_rol_check CHECK ((actor_rol = ANY (ARRAY['docente'::text, 'utp'::text, 'apoderado'::text, 'sistema'::text, 'orientador'::text, 'psicologo'::text, 'coordinador_convivencia'::text, 'director'::text, 'admin'::text, 'slep_tecnico'::text])))
);
CREATE TABLE IF NOT EXISTS public.kedas_kolibri_online (
    id bigint NOT NULL,
    establecimiento_id bigint NOT NULL,
    id_canal character varying(64) NOT NULL,
    nombre_canal character varying(255) NOT NULL,
    asignatura character varying(64) NOT NULL,
    asignatura_folder character varying(255) NOT NULL,
    id_recurso character varying(64) NOT NULL,
    titulo_recurso character varying(512) NOT NULL,
    tipo_recurso character varying(32) NOT NULL,
    primera_interaccion timestamp with time zone NOT NULL,
    ultima_interaccion timestamp with time zone NOT NULL,
    tiempo_segundos numeric(10,1) NOT NULL,
    progreso numeric(4,3) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    periodo_piloto character varying(32) DEFAULT 'nov-2025'::character varying NOT NULL,
    hash_usuario text NOT NULL,
    CONSTRAINT kedas_kolibri_online_progreso_check CHECK (((progreso >= (0)::numeric) AND (progreso <= (1)::numeric)))
);
CREATE TABLE IF NOT EXISTS public.kedas_kolibri_online_resumido (
    id bigint NOT NULL,
    establecimiento_id bigint NOT NULL,
    id_canal character varying(64) NOT NULL,
    nombre_canal character varying(255) NOT NULL,
    asignatura character varying(64) NOT NULL,
    asignatura_folder character varying(255) NOT NULL,
    id_recurso character varying(64) NOT NULL,
    titulo_recurso character varying(512) NOT NULL,
    tipo_recurso character varying(32) NOT NULL,
    primera_interaccion timestamp with time zone NOT NULL,
    ultima_interaccion timestamp with time zone NOT NULL,
    tiempo_finalizacion timestamp with time zone,
    tiempo_segundos numeric(10,1) NOT NULL,
    progreso numeric(4,3) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    periodo_piloto character varying(32) DEFAULT 'nov-2025'::character varying NOT NULL,
    hash_usuario text NOT NULL,
    CONSTRAINT kedas_kolibri_online_resumido_progreso_check CHECK (((progreso >= (0)::numeric) AND (progreso <= (1)::numeric)))
);

-- ── Vincular secuencias a su columna ──────────────────────────
DO $$
BEGIN
    ALTER SEQUENCE public.kedas_establecimientos_id_seq OWNED BY public.kedas_establecimientos.id;
    ALTER SEQUENCE public.kedas_cursos_id_seq OWNED BY public.kedas_cursos.id;
    ALTER SEQUENCE public.kedas_asistencia_id_seq OWNED BY public.kedas_asistencia.id;
    ALTER SEQUENCE public.kedas_audit_log_id_seq OWNED BY public.kedas_audit_log.id;
    ALTER SEQUENCE public.kedas_kolibri_online_id_seq OWNED BY public.kedas_kolibri_online.id;
    ALTER SEQUENCE public.kedas_kolibri_online_resumido_id_seq OWNED BY public.kedas_kolibri_online_resumido.id;
    ALTER SEQUENCE public.kedas_kolibri_online_resumido_id_seq OWNED BY public.kedas_kolibri_online_resumido.id;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Algunas secuencias ya estaban vinculadas, se omiten';
END $$;

-- ── Defaults ────────────────────────────────────────────────
DO $$
BEGIN
    ALTER TABLE ONLY public.kedas_establecimientos ALTER COLUMN id SET DEFAULT nextval('public.kedas_establecimientos_id_seq'::regclass);
    ALTER TABLE ONLY public.kedas_cursos ALTER COLUMN id SET DEFAULT nextval('public.kedas_cursos_id_seq'::regclass);
    ALTER TABLE ONLY public.kedas_asistencia ALTER COLUMN id SET DEFAULT nextval('public.kedas_asistencia_id_seq'::regclass);
    ALTER TABLE ONLY public.kedas_audit_log ALTER COLUMN id SET DEFAULT nextval('public.kedas_audit_log_id_seq'::regclass);
    ALTER TABLE ONLY public.kedas_kolibri_online ALTER COLUMN id SET DEFAULT nextval('public.kedas_kolibri_online_id_seq'::regclass);
    ALTER TABLE ONLY public.kedas_kolibri_online_resumido ALTER COLUMN id SET DEFAULT nextval('public.kedas_kolibri_online_resumido_id_seq'::regclass);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Algunos defaults ya existian, se omiten';
END $$;

-- ── Primary keys / unique ─────────────────────────────────────
DO $$
BEGIN
    ALTER TABLE ONLY public.kedas_establecimientos
    ADD CONSTRAINT kedas_establecimientos_codigo_rbd_key UNIQUE (codigo_rbd);
    ALTER TABLE ONLY public.kedas_establecimientos
    ADD CONSTRAINT kedas_establecimientos_pkey PRIMARY KEY (id);
    ALTER TABLE ONLY public.kedas_cursos
    ADD CONSTRAINT kedas_cursos_establecimiento_id_nombre_anno_escolar_key UNIQUE (establecimiento_id, nombre, anno_escolar);
    ALTER TABLE ONLY public.kedas_cursos
    ADD CONSTRAINT kedas_cursos_pkey PRIMARY KEY (id);
    ALTER TABLE ONLY public.kedas_pseudonimos
    ADD CONSTRAINT kedas_pseudonimos_pkey PRIMARY KEY (hash_id);
    ALTER TABLE ONLY public.kedas_asistencia
    ADD CONSTRAINT kedas_asistencia_hash_id_fecha_key UNIQUE (hash_id, fecha);
    ALTER TABLE ONLY public.kedas_asistencia
    ADD CONSTRAINT kedas_asistencia_pkey PRIMARY KEY (id);
    ALTER TABLE ONLY public.kedas_audit_log
    ADD CONSTRAINT kedas_audit_log_pkey PRIMARY KEY (id);
    ALTER TABLE ONLY public.kedas_kolibri_online
    ADD CONSTRAINT kedas_kolibri_online_pkey PRIMARY KEY (id);
    ALTER TABLE ONLY public.kedas_kolibri_online_resumido
    ADD CONSTRAINT kedas_kolibri_online_resumido_pkey PRIMARY KEY (id);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Algunos constraints ya existian, se omiten';
END $$;

-- ── Indices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_estab_slep ON public.kedas_establecimientos USING btree (slep_id);
CREATE INDEX IF NOT EXISTS idx_kedas_pseudonimos_establecimiento_id ON public.kedas_pseudonimos USING btree (establecimiento_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_hash_fecha ON public.kedas_asistencia USING btree (hash_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_asistencia_semaforo ON public.kedas_asistencia USING btree (curso_id, semaforo) WHERE (semaforo = ANY (ARRAY['amarillo'::text, 'rojo'::text]));
CREATE INDEX IF NOT EXISTS idx_audit_actor_ts ON public.kedas_audit_log USING btree (actor_id, timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_audit_estudiante_ts ON public.kedas_audit_log USING btree (hash_estudiante, timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_kolibri_online_asignatura ON public.kedas_kolibri_online USING btree (asignatura);
CREATE INDEX IF NOT EXISTS idx_kolibri_online_estab ON public.kedas_kolibri_online USING btree (establecimiento_id);
CREATE INDEX IF NOT EXISTS idx_kolibri_online_hash ON public.kedas_kolibri_online USING btree (establecimiento_id, hash_usuario);
CREATE INDEX IF NOT EXISTS idx_kolibri_online_resumido_estab ON public.kedas_kolibri_online_resumido USING btree (establecimiento_id);
CREATE INDEX IF NOT EXISTS idx_kolibri_online_resumido_hash ON public.kedas_kolibri_online_resumido USING btree (establecimiento_id, hash_usuario);
CREATE INDEX IF NOT EXISTS idx_kolibri_online_resumido_estab ON public.kedas_kolibri_online_resumido USING btree (establecimiento_id);
CREATE INDEX IF NOT EXISTS idx_kolibri_online_resumido_hash ON public.kedas_kolibri_online_resumido USING btree (establecimiento_id, hash_usuario);

-- ── Foreign keys internas ─────────────────────────────────────
DO $$
BEGIN
    ALTER TABLE ONLY public.kedas_cursos
    ADD CONSTRAINT kedas_cursos_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.kedas_establecimientos(id);
    ALTER TABLE ONLY public.kedas_pseudonimos
    ADD CONSTRAINT kedas_pseudonimos_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.kedas_establecimientos(id);
    ALTER TABLE ONLY public.kedas_asistencia
    ADD CONSTRAINT kedas_asistencia_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES public.kedas_cursos(id);
    ALTER TABLE ONLY public.kedas_clima_escolar
    ADD CONSTRAINT kedas_clima_escolar_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.kedas_establecimientos(id);
    ALTER TABLE ONLY public.kedas_alertas
    ADD CONSTRAINT kedas_alertas_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.kedas_establecimientos(id);
    ALTER TABLE ONLY public.kedas_conv_incidentes
    ADD CONSTRAINT kedas_conv_incidentes_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.kedas_establecimientos(id);
    ALTER TABLE ONLY public.kedas_kolibri_online
    ADD CONSTRAINT kedas_kolibri_online_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.kedas_establecimientos(id);
    ALTER TABLE ONLY public.kedas_kolibri_online_resumido
    ADD CONSTRAINT kedas_kolibri_online_resumido_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.kedas_establecimientos(id);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Algunas FK ya existian, se omiten';
END $$;

-- ── Función necesaria para triggers ───────────────────────────
CREATE OR REPLACE FUNCTION public.actualizar_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ── Triggers ──────────────────────────────────────────────────
DO $$
BEGIN
        CREATE TRIGGER trg_pseudonimos_updated BEFORE UPDATE ON public.kedas_pseudonimos FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Algunos triggers ya existian, se omiten';
END $$;

COMMIT;
