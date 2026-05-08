-- 1. TABLAS OFICIALES

CREATE TABLE IF NOT EXISTS public."proyectos_mant" (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    nombre TEXT NOT NULL,
    descripcion TEXT,
    estado TEXT DEFAULT 'Pendiente', -- Pendiente, En Proceso, Finalizado
    encargado TEXT,
    fecha_inicio DATE,
    fecha_fin DATE
);

CREATE TABLE IF NOT EXISTS public."tareas_proyecto_mant" (
    id BIGSERIAL PRIMARY KEY,
    proyecto_id BIGINT REFERENCES public."proyectos_mant"(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    nombre TEXT NOT NULL,
    completada BOOLEAN DEFAULT FALSE
);

-- 2. TABLAS NO OFICIALES (AMBIENTE DE PRUEBAS)

CREATE TABLE IF NOT EXISTS public."NO_proyectos_mant" (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    nombre TEXT NOT NULL,
    descripcion TEXT,
    estado TEXT DEFAULT 'Pendiente',
    encargado TEXT,
    fecha_inicio DATE,
    fecha_fin DATE
);

CREATE TABLE IF NOT EXISTS public."NO_tareas_proyecto_mant" (
    id BIGSERIAL PRIMARY KEY,
    proyecto_id BIGINT REFERENCES public."NO_proyectos_mant"(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    nombre TEXT NOT NULL,
    completada BOOLEAN DEFAULT FALSE
);

-- 3. POLÍTICAS RLS (Habilitar acceso anónimo/público para simplificar si no hay roles estrictos en DB)
ALTER TABLE public."proyectos_mant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tareas_proyecto_mant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."NO_proyectos_mant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."NO_tareas_proyecto_mant" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Access" ON public."proyectos_mant" FOR ALL USING (true);
CREATE POLICY "Public Access" ON public."tareas_proyecto_mant" FOR ALL USING (true);
CREATE POLICY "Public Access" ON public."NO_proyectos_mant" FOR ALL USING (true);
CREATE POLICY "Public Access" ON public."NO_tareas_proyecto_mant" FOR ALL USING (true);

-- 4. ACTUALIZACIÓN DE TABLAS EXISTENTES
ALTER TABLE public."repuestos" ADD COLUMN IF NOT EXISTS stock_minimo INTEGER DEFAULT 5;
ALTER TABLE public."solicitudes" ADD COLUMN IF NOT EXISTS tecnico_asignado TEXT;
ALTER TABLE public."solicitudes" ADD COLUMN IF NOT EXISTS usuario_id UUID;
ALTER TABLE public."NO_solicitudes" ADD COLUMN IF NOT EXISTS tecnico_asignado TEXT;
ALTER TABLE public."NO_solicitudes" ADD COLUMN IF NOT EXISTS usuario_id UUID;
ALTER TABLE public."NO_notificaciones" ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'info';

-- Notificar a PostgREST para recargar el esquema
NOTIFY pgrst, 'reload schema';
