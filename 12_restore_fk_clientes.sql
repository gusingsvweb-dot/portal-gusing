-- 12_restore_fk_clientes.sql

-- Añadir la llave foránea nuevamente a pedidos_produccion
ALTER TABLE public.pedidos_produccion
ADD CONSTRAINT pedidos_produccion_cliente_id_fkey 
FOREIGN KEY (cliente_id) 
REFERENCES public.clientes (id) 
ON DELETE SET NULL;

-- Notificar a PostgREST para que recargue el schema cache (necesario a veces en Supabase)
NOTIFY pgrst, 'reload schema';
