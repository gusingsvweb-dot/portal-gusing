-- Add fecha_inicio_analisis_mb to pedidos_produccion
ALTER TABLE public.pedidos_produccion
ADD COLUMN IF NOT EXISTS fecha_inicio_analisis_mb timestamptz;

COMMENT ON COLUMN public.pedidos_produccion.fecha_inicio_analisis_mb IS 'Fecha cuando Microbiología inicia el análisis (boton Iniciar Analisis MB)';
