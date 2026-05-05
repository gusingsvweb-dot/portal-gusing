-- Asegurar estructura de tablas No Oficiales
CREATE TABLE IF NOT EXISTS "NO_solicitudes" (
    id SERIAL PRIMARY KEY,
    consecutivo INT,
    area_id INT,
    tipo_solicitud_id INT,
    prioridad_id INT,
    estado_id INT DEFAULT 1,
    usuario_id TEXT,
    area_solicitante TEXT,
    descripcion TEXT,
    justificacion TEXT,
    activo_id UUID,
    fecha_cierre TIMESTAMPTZ,
    accion_realizada TEXT,
    proveedor_id INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Asegurar que existan tipos de solicitud básicos en el modo prueba
INSERT INTO "NO_tipos_solicitud" (nombre, id_area_relacionada)
SELECT nombre, id_area_relacionada FROM tipos_solicitud
ON CONFLICT DO NOTHING;

-- Asegurar estados y prioridades
INSERT INTO "NO_estados" (id, nombre) SELECT id, nombre FROM estados ON CONFLICT DO NOTHING;
INSERT INTO "NO_prioridades" (id, nombre) SELECT id, nombre FROM prioridades ON CONFLICT DO NOTHING;
