-- 05_cleanup_flujos_forma.sql

-- 1. Desactivar todos los flujos primero
UPDATE flujos_forma SET activo = false;

-- 2. Asegurar que solo existan los nombres CANÓNICOS (sin acentos) y marcarlos como activos
-- Esto usa los nombres exactos que utiliza la lógica de programación en Produccion.jsx
INSERT INTO flujos_forma (forma_farmaceutica, activo)
VALUES 
('CAPSULAS', true),
('TABLETAS', true),
('POLVOS GRANULADOS', true),
('SOLUCION ORAL', true),
('GEL-UNGUENTO-JARABE', true),
('SOLUCIONES ESTERILES (AMPOLLAS - VIALES)', true)
ON CONFLICT (forma_farmaceutica) DO UPDATE SET activo = true;

-- 3. MERGE: Redirigir todos los pedidos que apuntan a formas con acentos a las formas sin acentos
DO $$
DECLARE
    accented_record RECORD;
    canonical_id BIGINT;
BEGIN
    FOR accented_record IN 
        SELECT id, forma_farmaceutica 
        FROM flujos_forma 
        WHERE forma_farmaceutica IN ('SOLUCIÓN ORAL', 'GEL-UNGÜENTO-JARABE', 'SOLUCIONES ESTÉRILES (AMPOLLAS-VIALES)')
    LOOP
        -- Buscar el ID de la versión sin acentos
        SELECT id INTO canonical_id 
        FROM flujos_forma 
        WHERE forma_farmaceutica = REPLACE(REPLACE(REPLACE(accented_record.forma_farmaceutica, 'Ó', 'O'), 'Ü', 'U'), 'É', 'E');

        IF canonical_id IS NOT NULL AND canonical_id <> accented_record.id THEN
            -- 1. Actualizar referencias en los DATOS (pedidos reales)
            UPDATE pedido_etapas SET flujo_id = canonical_id WHERE flujo_id = accented_record.id;
            
            -- 2. BORRAR las etapas de CONFIGURACIÓN de la versión con acento 
            -- (No las actualizamos porque causarían conflicto si la versión sin acento ya tiene sus propias etapas)
            DELETE FROM flujos_forma_etapas WHERE flujo_id = accented_record.id;
            
            -- 3. Ahora sí podemos borrar la forma duplicada de forma segura
            DELETE FROM flujos_forma WHERE id = accented_record.id;
        END IF;
    END LOOP;
END $$;
