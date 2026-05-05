-- Establecer relaciones (Foreign Keys) para que Supabase pueda hacer JOINs
ALTER TABLE "NO_solicitudes" 
    DROP CONSTRAINT IF EXISTS fk_no_estados,
    DROP CONSTRAINT IF EXISTS fk_no_prioridades,
    DROP CONSTRAINT IF EXISTS fk_no_tipos,
    DROP CONSTRAINT IF EXISTS fk_no_areas,
    DROP CONSTRAINT IF EXISTS fk_no_activos;

ALTER TABLE "NO_solicitudes"
    ADD CONSTRAINT fk_no_estados FOREIGN KEY (estado_id) REFERENCES "NO_estados"(id),
    ADD CONSTRAINT fk_no_prioridades FOREIGN KEY (prioridad_id) REFERENCES "NO_prioridades"(id),
    ADD CONSTRAINT fk_no_tipos FOREIGN KEY (tipo_solicitud_id) REFERENCES "NO_tipos_solicitud"(id),
    ADD CONSTRAINT fk_no_areas FOREIGN KEY (area_id) REFERENCES "NO_areas"(id),
    ADD CONSTRAINT fk_no_activos FOREIGN KEY (activo_id) REFERENCES "NO_activos"(id);

-- Forzar recarga de esquema de PostgREST (esto se hace automático al cambiar la tabla)
COMMENT ON TABLE "NO_solicitudes" IS 'Tabla de solicitudes para entorno No Oficial con relaciones activas';
