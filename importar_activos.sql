/* =====================================================
   SQL — Módulo de Importación de Activos
   FR-MN-19 Listado Maestro de Equipos
   FR-MN-05 Listado Maestro de Equipos de Oficina

   INSTRUCCIONES:
   1. Abrir SQL Editor en supabase.com
   2. Ejecutar TODO este script de una sola vez
   3. Verificar las tablas en el Table Editor
   ===================================================== */

-- ──────────────────────────────────────────────────────────────────
-- 1. EXTENDER LA TABLA EXISTENTE "activos" CON CAMPOS NUEVOS
--    (usa IF NOT EXISTS para no fallar si ya existen)
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public."activos"
  ADD COLUMN IF NOT EXISTS asset_type          text,
  ADD COLUMN IF NOT EXISTS equipment_subtype   text,
  ADD COLUMN IF NOT EXISTS process             text,
  ADD COLUMN IF NOT EXISTS responsible_process text,
  ADD COLUMN IF NOT EXISTS responsible         text,
  ADD COLUMN IF NOT EXISTS plant               text,
  ADD COLUMN IF NOT EXISTS level_num           integer,
  ADD COLUMN IF NOT EXISTS area                text,
  ADD COLUMN IF NOT EXISTS sterile_area        text,
  ADD COLUMN IF NOT EXISTS location            text,
  ADD COLUMN IF NOT EXISTS purpose             text,
  ADD COLUMN IF NOT EXISTS sac                 text,
  ADD COLUMN IF NOT EXISTS serial              text,
  ADD COLUMN IF NOT EXISTS imei                text,
  ADD COLUMN IF NOT EXISTS brand               text,
  ADD COLUMN IF NOT EXISTS model_name          text,
  ADD COLUMN IF NOT EXISTS charger             text,
  ADD COLUMN IF NOT EXISTS source_document     text,
  ADD COLUMN IF NOT EXISTS source_sheet        text,
  ADD COLUMN IF NOT EXISTS source_file_name    text,
  ADD COLUMN IF NOT EXISTS imported_by         uuid,
  ADD COLUMN IF NOT EXISTS imported_at         timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at          timestamptz DEFAULT now();

-- Lo mismo para la variante NO_
ALTER TABLE public."NO_activos"
  ADD COLUMN IF NOT EXISTS asset_type          text,
  ADD COLUMN IF NOT EXISTS equipment_subtype   text,
  ADD COLUMN IF NOT EXISTS process             text,
  ADD COLUMN IF NOT EXISTS responsible_process text,
  ADD COLUMN IF NOT EXISTS responsible         text,
  ADD COLUMN IF NOT EXISTS plant               text,
  ADD COLUMN IF NOT EXISTS level_num           integer,
  ADD COLUMN IF NOT EXISTS area                text,
  ADD COLUMN IF NOT EXISTS sterile_area        text,
  ADD COLUMN IF NOT EXISTS location            text,
  ADD COLUMN IF NOT EXISTS purpose             text,
  ADD COLUMN IF NOT EXISTS sac                 text,
  ADD COLUMN IF NOT EXISTS serial              text,
  ADD COLUMN IF NOT EXISTS imei                text,
  ADD COLUMN IF NOT EXISTS brand               text,
  ADD COLUMN IF NOT EXISTS model_name          text,
  ADD COLUMN IF NOT EXISTS charger             text,
  ADD COLUMN IF NOT EXISTS source_document     text,
  ADD COLUMN IF NOT EXISTS source_sheet        text,
  ADD COLUMN IF NOT EXISTS source_file_name    text,
  ADD COLUMN IF NOT EXISTS imported_by         uuid,
  ADD COLUMN IF NOT EXISTS imported_at         timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at          timestamptz DEFAULT now();

-- ──────────────────────────────────────────────────────────────────
-- 2. TABLA: asset_technical_specs
--    Specs técnicas de computadores (procesador, RAM, discos, etc.)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.asset_technical_specs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    activo_id   text NOT NULL,          -- Referencia por código (ej: PC-001)
    processor   text,
    ram         text,
    disk_c      text,
    disk_d      text,
    software    text,
    monitor     text,
    mouse       text,
    keyboard    text,
    extra_specs jsonb DEFAULT '{}',
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ats_activo ON public.asset_technical_specs (activo_id);

-- Tabla NO_
CREATE TABLE IF NOT EXISTS public."NO_asset_technical_specs" (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    activo_id   text NOT NULL,
    processor   text,
    ram         text,
    disk_c      text,
    disk_d      text,
    software    text,
    monitor     text,
    mouse       text,
    keyboard    text,
    extra_specs jsonb DEFAULT '{}',
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────
-- 3. TABLA: asset_import_batches
--    Registro de cada importación realizada
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.asset_import_batches (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file_name  text NOT NULL,
    source_document   text NOT NULL,
    total_rows        integer DEFAULT 0,
    imported_rows     integer DEFAULT 0,
    skipped_rows      integer DEFAULT 0,
    error_rows        integer DEFAULT 0,
    imported_by       uuid,
    imported_at       timestamptz DEFAULT now(),
    summary           jsonb DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public."NO_asset_import_batches" (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file_name  text NOT NULL,
    source_document   text NOT NULL,
    total_rows        integer DEFAULT 0,
    imported_rows     integer DEFAULT 0,
    skipped_rows      integer DEFAULT 0,
    error_rows        integer DEFAULT 0,
    imported_by       uuid,
    imported_at       timestamptz DEFAULT now(),
    summary           jsonb DEFAULT '{}'
);

-- ──────────────────────────────────────────────────────────────────
-- 4. ÍNDICES ÚTILES SOBRE activos
-- ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activos_asset_type  ON public."activos" (asset_type);
CREATE INDEX IF NOT EXISTS idx_activos_source_doc  ON public."activos" (source_document);
CREATE INDEX IF NOT EXISTS idx_activos_status      ON public."activos" (estado);
CREATE INDEX IF NOT EXISTS idx_activos_codigo      ON public."activos" (codigo);

-- ──────────────────────────────────────────────────────────────────
-- 5. TRIGGER: auto-actualizar updated_at en activos
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_activos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activos_updated_at ON public."activos";
CREATE TRIGGER trg_activos_updated_at
  BEFORE UPDATE ON public."activos"
  FOR EACH ROW EXECUTE FUNCTION update_activos_updated_at();

-- ──────────────────────────────────────────────────────────────────
-- 6. RLS — políticas permisivas (ajustar según tu auth)
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.asset_technical_specs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_import_batches   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_tech_specs"
  ON public.asset_technical_specs FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_import_batches"
  ON public.asset_import_batches FOR ALL USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────
-- 7. VISTA útil: activos con sus specs técnicas
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_activos_completos AS
SELECT
    a.*,
    ts.processor,
    ts.ram,
    ts.disk_c,
    ts.disk_d,
    ts.software,
    ts.monitor,
    ts.mouse,
    ts.keyboard
FROM public."activos" a
LEFT JOIN public.asset_technical_specs ts ON ts.activo_id = a.codigo;
