/* 
  PRO MANTENIMIENTO: EXPANSIÓN DE ESQUEMA (PHARMA LEVEL)
  Este script añade soporte para Criticidad, Plan Maestro, Repuestos y RPC.
*/

-- 1. ACTUALIZAR ACTIVOS CON CRITICIDAD
ALTER TABLE public."activos" ADD COLUMN IF NOT EXISTS criticidad TEXT DEFAULT 'Baja';
ALTER TABLE public."NO_activos" ADD COLUMN IF NOT EXISTS criticidad TEXT DEFAULT 'Baja';

-- 2. TABLAS DE PLAN MAESTRO DE PREVENTIVOS
CREATE TABLE IF NOT EXISTS public."planes_preventivos" (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    activo_id BIGINT REFERENCES public."activos"(id) ON DELETE CASCADE,
    frecuencia_dias INTEGER NOT NULL, -- Ej: 30, 90, 365
    ultima_fecha DATE,
    proxima_fecha DATE NOT NULL,
    descripcion_tarea TEXT,
    activo BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS public."NO_planes_preventivos" (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    activo_id BIGINT REFERENCES public."NO_activos"(id) ON DELETE CASCADE,
    frecuencia_dias INTEGER NOT NULL,
    ultima_fecha DATE,
    proxima_fecha DATE NOT NULL,
    descripcion_tarea TEXT,
    activo BOOLEAN DEFAULT true
);

-- 3. TABLAS DE REPUESTOS E INSUMOS
CREATE TABLE IF NOT EXISTS public."repuestos" (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    nombre TEXT NOT NULL,
    stock NUMERIC DEFAULT 0,
    costo NUMERIC DEFAULT 0,
    unidad TEXT DEFAULT 'Unidad'
);

CREATE TABLE IF NOT EXISTS public."NO_repuestos" (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    nombre TEXT NOT NULL,
    stock NUMERIC DEFAULT 0,
    costo NUMERIC DEFAULT 0,
    unidad TEXT DEFAULT 'Unidad'
);

-- 4. TABLAS DE CONSUMOS (Vincular repuestos a intervenciones)
CREATE TABLE IF NOT EXISTS public."consumos" (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    solicitud_id BIGINT REFERENCES public."solicitudes"(id) ON DELETE CASCADE,
    repuesto_id BIGINT REFERENCES public."repuestos"(id),
    cantidad NUMERIC NOT NULL,
    costo_en_momento NUMERIC 
);

CREATE TABLE IF NOT EXISTS public."NO_consumos" (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    solicitud_id BIGINT REFERENCES public."NO_solicitudes"(id) ON DELETE CASCADE,
    repuesto_id BIGINT REFERENCES public."NO_repuestos"(id),
    cantidad NUMERIC NOT NULL,
    costo_en_momento NUMERIC
);

-- 5. FUNCIÓN RPC PARA DECREMENTAR STOCK (Atómica)
CREATE OR REPLACE FUNCTION decrement_repuesto_stock(row_id bigint, amount numeric)
RETURNS void AS $$
BEGIN
    UPDATE public.repuestos
    SET stock = stock - amount
    WHERE id = row_id;

    -- Si existe la tabla NO_, también intentamos ahí
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'NO_repuestos') THEN
        UPDATE public."NO_repuestos"
        SET stock = stock - amount
        WHERE id = row_id;
    END IF;
END;
$$ LANGUAGE plpgsql;
