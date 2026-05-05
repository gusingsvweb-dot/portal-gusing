-- Crear tabla de áreas para el entorno No Oficial si no existe
CREATE TABLE IF NOT EXISTS "NO_areas" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Copiar áreas del oficial al no oficial para tener una base
INSERT INTO "NO_areas" (nombre)
SELECT nombre FROM areas
ON CONFLICT (nombre) DO NOTHING;
