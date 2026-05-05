/* =====================================================
   SQL para Supabase — Módulo de Cronograma de Mantenimiento
   FR-MN-01 Cronograma de mantenimientos preventivos
   
   INSTRUCCIONES:
   1. Abrir el SQL Editor en supabase.com
   2. Pegar todo este script y ejecutar
   3. Verificar que las tablas aparecen en el Table Editor
   ===================================================== */

-- ────────────────────────────────────────────────────────────────────
-- 1. TABLA PRINCIPAL: maintenance_schedules
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maintenance_schedules (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    year             integer          NOT NULL,
    equipment_code   text             NOT NULL,
    equipment_name   text             NOT NULL,
    task_description text,
    scheduled_week   integer,
    frequency_months integer,
    base_month       integer,
    source_file_name text,
    imported_by      uuid             REFERENCES auth.users(id) ON DELETE SET NULL,
    imported_at      timestamptz      DEFAULT now(),
    created_at       timestamptz      DEFAULT now(),

    -- Restricción de unicidad: un equipo solo puede aparecer una vez por año
    CONSTRAINT uq_schedule_year_code UNIQUE (year, equipment_code)
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_ms_year        ON public.maintenance_schedules (year);
CREATE INDEX IF NOT EXISTS idx_ms_code        ON public.maintenance_schedules (equipment_code);
CREATE INDEX IF NOT EXISTS idx_ms_imported_by ON public.maintenance_schedules (imported_by);

-- ────────────────────────────────────────────────────────────────────
-- 2. TABLA DETALLE: maintenance_schedule_months
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maintenance_schedule_months (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id  uuid             NOT NULL
                   REFERENCES public.maintenance_schedules(id) ON DELETE CASCADE,
    month_number integer          NOT NULL CHECK (month_number BETWEEN 1 AND 12),
    month_name   text             NOT NULL,
    is_scheduled boolean          DEFAULT true,
    status       text             DEFAULT 'Pendiente'
                   CHECK (status IN ('Pendiente', 'Ejecutado', 'Reprogramado', 'Cancelado')),
    completed_at timestamptz,
    notes        text,
    created_at   timestamptz      DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_msm_schedule ON public.maintenance_schedule_months (schedule_id);
CREATE INDEX IF NOT EXISTS idx_msm_month    ON public.maintenance_schedule_months (month_number);
CREATE INDEX IF NOT EXISTS idx_msm_status   ON public.maintenance_schedule_months (status);

-- ────────────────────────────────────────────────────────────────────
-- 3. VARIANTES NO_ (entorno de pruebas del sistema dual)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."NO_maintenance_schedules" (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    year             integer          NOT NULL,
    equipment_code   text             NOT NULL,
    equipment_name   text             NOT NULL,
    task_description text,
    scheduled_week   integer,
    frequency_months integer,
    base_month       integer,
    source_file_name text,
    imported_by      uuid,
    imported_at      timestamptz      DEFAULT now(),
    created_at       timestamptz      DEFAULT now(),
    CONSTRAINT uq_no_schedule_year_code UNIQUE (year, equipment_code)
);

CREATE TABLE IF NOT EXISTS public."NO_maintenance_schedule_months" (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id  uuid             NOT NULL
                   REFERENCES public."NO_maintenance_schedules"(id) ON DELETE CASCADE,
    month_number integer          NOT NULL CHECK (month_number BETWEEN 1 AND 12),
    month_name   text             NOT NULL,
    is_scheduled boolean          DEFAULT true,
    status       text             DEFAULT 'Pendiente'
                   CHECK (status IN ('Pendiente', 'Ejecutado', 'Reprogramado', 'Cancelado')),
    completed_at timestamptz,
    notes        text,
    created_at   timestamptz      DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY (RLS) — ajustar según tu política de auth
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.maintenance_schedules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_schedule_months  ENABLE ROW LEVEL SECURITY;

-- Política permisiva para el rol de mantenimiento (ajustar según tu auth)
-- Si usas service_role key desde frontend, o si ya tienes anon_key con bypass:
CREATE POLICY "allow_all_authenticated"
  ON public.maintenance_schedules
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_authenticated"
  ON public.maintenance_schedule_months
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Igual para las tablas NO_
ALTER TABLE public."NO_maintenance_schedules"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."NO_maintenance_schedule_months" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_no_sched"
  ON public."NO_maintenance_schedules"
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_no_months"
  ON public."NO_maintenance_schedule_months"
  FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────
-- 5. VISTA útil para reportes (join schedule + months)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_cronograma_mantenimiento AS
SELECT
    s.year,
    s.equipment_code,
    s.equipment_name,
    s.task_description,
    s.scheduled_week,
    s.frequency_months,
    s.base_month,
    s.source_file_name,
    s.imported_at,
    m.month_number,
    m.month_name,
    m.status,
    m.completed_at,
    m.notes
FROM public.maintenance_schedules s
JOIN public.maintenance_schedule_months m ON m.schedule_id = s.id
ORDER BY s.year, s.equipment_code, m.month_number;

-- ────────────────────────────────────────────────────────────────────
-- 6. FUNCIÓN: actualizar estado de un mes
--    Uso: SELECT update_maintenance_status('uuid-del-mes', 'Ejecutado', 'Nota opcional');
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_maintenance_status(
    p_month_id  uuid,
    p_status    text,
    p_notes     text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE public.maintenance_schedule_months
    SET
        status       = p_status,
        notes        = COALESCE(p_notes, notes),
        completed_at = CASE WHEN p_status = 'Ejecutado' THEN now() ELSE completed_at END
    WHERE id = p_month_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
