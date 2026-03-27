-- 11_add_clientes_table.sql

-- Eliminar tabla si existe para recreación limpia (opcional para desarrollo)
DROP TABLE IF EXISTS public.clientes CASCADE;

-- Crear tabla clientes
CREATE TABLE public.clientes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre text NOT NULL,
  identificacion text NULL,
  direccion text NULL,
  telefono text NULL,
  created_at timestamp with time zone default now() not null,
  CONSTRAINT clientes_pkey PRIMARY KEY (id),
  CONSTRAINT clientes_identificacion_key UNIQUE (identificacion)
) TABLESPACE pg_default;

-- Activar RLS en la tabla
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Crear políticas para permitir acceso a roles específicos
-- En este caso asumiendo que el campo "rol" del usuario lo permite,
-- O por autenticación genérica del public.usuarios.

-- 1. Políticas de Selección (Lectura)
-- Todos los usuarios autenticados pueden ver la lista (o podemos restringir)
CREATE POLICY "Permitir select en clientes para usuarios autenticados"
ON public.clientes
FOR SELECT
TO authenticated
USING (true);

-- 2. Políticas de Inserción
-- Permitir a los usuarios insertar nuevos clientes
CREATE POLICY "Permitir insert en clientes para usuarios autenticados"
ON public.clientes
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 3. Políticas de Actualización
-- Permitir actualizar clientes
CREATE POLICY "Permitir update en clientes para usuarios autenticados"
ON public.clientes
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Se asume que las verdaderas restricciones de negocio (solo atención o gerencia pueden crear)
-- estarán manejadas a nivel de Frontend o en vistas/funciones más específicas, 
-- pero la base de RLS auth permite el acceso al pool interno de usuarios de la aplicación.
