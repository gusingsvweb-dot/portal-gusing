-- Ensure permissions for pedidos_bodega_items
-- Enable RLS just in case it wasn't
ALTER TABLE public.pedidos_bodega_items ENABLE ROW LEVEL SECURITY;

-- Policy for SELECT: Allow authenticated users (or specifically produccion/bodega) to view items
-- We'll allow authenticated for simplicity in this context, or you can refine it.
CREATE POLICY "Usuarios autenticados pueden ver items de bodega"
ON public.pedidos_bodega_items
FOR SELECT
TO authenticated
USING (true);

-- Policy for INSERT/UPDATE: We already know Bodega updates and Produccion inserts. 
-- Ensure Produccion can insert
CREATE POLICY "Produccion puede solicitar items"
ON public.pedidos_bodega_items
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Ensure Bodega (and Produccion for critical updates?) can update
CREATE POLICY "Permitir actualizaciones de items"
ON public.pedidos_bodega_items
FOR UPDATE
TO authenticated
USING (true);
