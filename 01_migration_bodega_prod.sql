-- Add columns to pedidos_bodega_items for better tracking
ALTER TABLE public.pedidos_bodega_items
ADD COLUMN IF NOT EXISTS es_critico boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS cantidad_entregada numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS observacion text;

-- Add comment to explain columns
COMMENT ON COLUMN public.pedidos_bodega_items.es_critico IS 'Indica si el insumo es bloqueante/necesario para produccion (true) o si se puede entregar despues (false)';
COMMENT ON COLUMN public.pedidos_bodega_items.cantidad_entregada IS 'Cantidad real entregada por bodega';
COMMENT ON COLUMN public.pedidos_bodega_items.observacion IS 'Observaciones de bodega sobre la entrega del item';
    