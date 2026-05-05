-- 1. Limpiar y Sincronizar Catálogos con IDs exactos
TRUNCATE "NO_estados" CASCADE;
INSERT INTO "NO_estados" (id, nombre) SELECT id, nombre FROM estados;

TRUNCATE "NO_prioridades" CASCADE;
INSERT INTO "NO_prioridades" (id, nombre) SELECT id, nombre FROM prioridades;

TRUNCATE "NO_tipos_solicitud" CASCADE;
INSERT INTO "NO_tipos_solicitud" (id, nombre, id_area_relacionada) 
SELECT id, nombre, id_area_relacionada FROM tipos_solicitud;

-- 2. Asegurar que las solicitudes existentes tengan IDs válidos (limpiar por si acaso)
-- TRUNCATE "NO_solicitudes" CASCADE; -- Opcional, pero recomendado para empezar limpio

-- 3. Re-establecer Foreign Keys
ALTER TABLE "NO_solicitudes" 
    ADD CONSTRAINT fk_no_estados FOREIGN KEY (estado_id) REFERENCES "NO_estados"(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_no_prioridades FOREIGN KEY (prioridad_id) REFERENCES "NO_prioridades"(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_no_tipos FOREIGN KEY (tipo_solicitud_id) REFERENCES "NO_tipos_solicitud"(id) ON DELETE CASCADE;
