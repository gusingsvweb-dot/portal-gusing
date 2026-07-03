-- Add requiere_solicitud_mb to pedidos_produccion (y su espejo NO_pedidos_produccion)
-- Cuando es false, no se dispara automáticamente la solicitud a Microbiología
-- en la etapa designada por la forma farmacéutica (Envasado / Esterilización).
ALTER TABLE public.pedidos_produccion
ADD COLUMN IF NOT EXISTS requiere_solicitud_mb boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pedidos_produccion.requiere_solicitud_mb IS 'Si es false, se omite el disparo automático de la solicitud a Microbiología en la etapa designada por la forma farmacéutica.';

ALTER TABLE public."NO_pedidos_produccion"
ADD COLUMN IF NOT EXISTS requiere_solicitud_mb boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public."NO_pedidos_produccion".requiere_solicitud_mb IS 'Si es false, se omite el disparo automático de la solicitud a Microbiología en la etapa designada por la forma farmacéutica.';

-- Instrucciones:
-- 1. Ejecutar este SQL en el Supabase SQL Editor.
