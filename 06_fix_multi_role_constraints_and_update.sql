-- 06_fix_multi_role_constraints_and_update.sql

-- 1. Eliminar las restricciones físicas que impiden múltiples roles (comas)
-- Intentamos con varios nombres posibles de restricciones según el error reportado
ALTER TABLE pedido_etapas DROP CONSTRAINT IF EXISTS pedido_etapas_rol_liberador_check;
ALTER TABLE pedido_etapas DROP CONSTRAINT IF EXISTS chk_rol_liberador_regla;

ALTER TABLE flujos_forma_etapas DROP CONSTRAINT IF EXISTS flujos_forma_etapas_rol_liberador_check;
ALTER TABLE flujos_forma_etapas DROP CONSTRAINT IF EXISTS chk_rol_liberador_regla;

-- 2. Actualizar la etapa de Formulación para pedidos EXISTENTES de Soluciones Estériles
-- Corregimos la consulta anterior usando la columna 'referencia' para el JOIN
UPDATE pedido_etapas 
SET rol_liberador = 'control_calidad,microbiologia'
WHERE nombre = 'Formulación' 
  AND pedido_id IN (
    SELECT id FROM pedidos_produccion 
    WHERE referencia IN (
        SELECT referencia FROM productos 
        WHERE forma_farmaceutica ILIKE '%esteril%' 
           OR forma_farmaceutica ILIKE '%estéril%'
    )
  );

-- 3. Asegurar que las liberaciones necesarias existan para esos pedidos ya en marcha
-- (Si la etapa ya estaba creada pero solo tenía un rol, esto inserta el faltante)
INSERT INTO pedido_etapas_liberaciones (pedido_etapa_id, rol, liberada, comentario)
SELECT pe.id, 'microbiologia', false, ''
FROM pedido_etapas pe
WHERE pe.nombre = 'Formulación'
  AND pe.rol_liberador LIKE '%microbiologia%'
  AND NOT EXISTS (
    SELECT 1 FROM pedido_etapas_liberaciones pel 
    WHERE pel.pedido_etapa_id = pe.id AND pel.rol = 'microbiologia'
  );

INSERT INTO pedido_etapas_liberaciones (pedido_etapa_id, rol, liberada, comentario)
SELECT pe.id, 'control_calidad', false, ''
FROM pedido_etapas pe
WHERE pe.nombre = 'Formulación'
  AND pe.rol_liberador LIKE '%control_calidad%'
  AND NOT EXISTS (
    SELECT 1 FROM pedido_etapas_liberaciones pel 
    WHERE pel.pedido_etapa_id = pe.id AND pel.rol = 'control_calidad'
  );
