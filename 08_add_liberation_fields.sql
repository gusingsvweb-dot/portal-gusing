-- 08_add_liberation_fields.sql

-- 1. Agregar columnas a pedido_etapas_liberaciones (Para etapas intermedias)
ALTER TABLE pedido_etapas_liberaciones
ADD COLUMN IF NOT EXISTS numero_analisis TEXT,
ADD COLUMN IF NOT EXISTS responsable_manual TEXT;

-- 2. Agregar columnas a solicitudes (Para sol. inicial microbiologia)
ALTER TABLE solicitudes
ADD COLUMN IF NOT EXISTS numero_analisis TEXT,
ADD COLUMN IF NOT EXISTS responsable_manual TEXT;

-- 3. Agregar columnas a pedidos_produccion (Para liberación final PT - Control Calidad)
ALTER TABLE pedidos_produccion
ADD COLUMN IF NOT EXISTS numero_analisis_pt TEXT,
ADD COLUMN IF NOT EXISTS responsable_liberacion_pt TEXT;
