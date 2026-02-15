-- 07_cleanup_combined_liberation_rows.sql

-- Eliminar las filas de liberación que tengan comas en el nombre del rol
-- (Estas filas son remanentes de la configuración anterior y bloquean el avance de etapa)
DELETE FROM pedido_etapas_liberaciones 
WHERE rol LIKE '%,%';

-- Asegurar que todos los pedidos de Soluciones Estériles tengan sus roles individuales (por si acaso)
INSERT INTO pedido_etapas_liberaciones (pedido_etapa_id, rol, liberada, comentario)
SELECT pe.id, 'control_calidad', false, ''
FROM pedido_etapas pe
WHERE pe.rol_liberador LIKE '%control_calidad%'
  AND NOT EXISTS (
    SELECT 1 FROM pedido_etapas_liberaciones pel 
    WHERE pel.pedido_etapa_id = pe.id AND pel.rol = 'control_calidad'
  );

INSERT INTO pedido_etapas_liberaciones (pedido_etapa_id, rol, liberada, comentario)
SELECT pe.id, 'microbiologia', false, ''
FROM pedido_etapas pe
WHERE pe.rol_liberador LIKE '%microbiologia%'
  AND NOT EXISTS (
    SELECT 1 FROM pedido_etapas_liberaciones pel 
    WHERE pel.pedido_etapa_id = pe.id AND pel.rol = 'microbiologia'
  );
