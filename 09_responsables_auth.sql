-- 09_responsables_auth.sql

-- 1. Crear tabla de responsables de liberación
CREATE TABLE IF NOT EXISTS responsables_liberacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    area TEXT NOT NULL, -- 'control_calidad' o 'microbiologia'
    clave TEXT NOT NULL, -- Clave personal (PIN o contraseña corta)
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Insertar algunos responsables de ejemplo (El cliente los configurará luego)
-- NOTA: En producción, las claves deberían estar hasheadas si son sensibles, 
-- pero para este subsistema interno de "firma" manual, usaremos texto claro por ahora según requerimiento de rapidez.

INSERT INTO responsables_liberacion (nombre, area, clave)
VALUES 
('Analista CC 1', 'control_calidad', '1234'),
('Jefe Calidad', 'control_calidad', '5678'),
('Microbiólogo 1', 'microbiologia', '1111'),
('Jefe Microbiología', 'microbiologia', '2222');

-- 3. Habilitar RLS (opcional pero recomendado)
ALTER TABLE responsables_liberacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura para todos los autenticados" ON responsables_liberacion FOR SELECT TO authenticated USING (true);
