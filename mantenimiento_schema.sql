/* 
  SCRIPT DE ACTIVACIÓN DEFINITIVO (CON COMILLAS DE PRECISIÓN)
*/

-- 1. CREAR ÁREAS OFICIALES (Si faltan)
CREATE TABLE IF NOT EXISTS public."areas" (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL UNIQUE
);

-- 2. CREAR TABLAS DE ACTIVOS CON COMILLAS EXACTAS
CREATE TABLE IF NOT EXISTS public."activos" (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL,
    area_id INTEGER REFERENCES public."areas"(id),
    codigo TEXT,
    descripcion TEXT
);

CREATE TABLE IF NOT EXISTS public."NO_activos" (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL,
    area_id INTEGER REFERENCES public."NO_areas"(id),
    codigo TEXT,
    descripcion TEXT
);

-- 3. CREAR TABLAS DE PROVEEDORES
CREATE TABLE IF NOT EXISTS public."proveedores_mant" (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    nombre TEXT NOT NULL,
    especialidad TEXT,
    contacto TEXT,
    telefono TEXT,
    email TEXT
);

CREATE TABLE IF NOT EXISTS public."NO_proveedores_mant" (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    nombre TEXT NOT NULL,
    especialidad TEXT,
    contacto TEXT,
    telefono TEXT,
    email TEXT
);

-- 4. ACTUALIZACIÓN DE SOLICITUDES CON SQL DINÁMICO
DO $$ 
BEGIN 
    -- Oficial
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'solicitudes') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='solicitudes' AND column_name='activo_id') THEN
            EXECUTE 'ALTER TABLE public."solicitudes" ADD COLUMN activo_id BIGINT REFERENCES public."activos"(id)';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='solicitudes' AND column_name='proveedor_id') THEN
            EXECUTE 'ALTER TABLE public."solicitudes" ADD COLUMN proveedor_id BIGINT REFERENCES public."proveedores_mant"(id)';
        END IF;
    END IF;

    -- No Oficial (Fijándonos en las mayúsculas exactas)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'NO_solicitudes') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='NO_solicitudes' AND column_name='activo_id') THEN
            EXECUTE 'ALTER TABLE public."NO_solicitudes" ADD COLUMN activo_id BIGINT REFERENCES public."NO_activos"(id)';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='NO_solicitudes' AND column_name='proveedor_id') THEN
            EXECUTE 'ALTER TABLE public."NO_solicitudes" ADD COLUMN proveedor_id BIGINT REFERENCES public."NO_proveedores_mant"(id)';
        END IF;
    END IF;
END $$;
