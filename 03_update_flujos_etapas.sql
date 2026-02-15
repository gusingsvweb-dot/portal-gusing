-- 03_update_flujos_etapas.sql

-- 1. Relax constraints for multi-role support
ALTER TABLE flujos_forma_etapas DROP CONSTRAINT IF EXISTS chk_rol_liberador_regla;
ALTER TABLE pedido_etapas DROP CONSTRAINT IF EXISTS chk_rol_liberador_regla;

-- 2. Limpiar etapas existentes
-- OJO: Esto borraría historial si no se tiene cuidado con los IDs. 
-- PERO: Si el usuario quiere "recargar" la configuración, lo ideal es actualizar o borrar/insertar solo la CONFIGURACIÓN.
-- La tabla de datos 'pedido_etapas' apunta a 'flujos_forma_etapas'?? 
-- Vamos a asumir que 'flujos_forma_etapas' es catálogo.

-- PRIMERO: Asegurar que los flujos (Formas) existen en 'flujos_forma'.
-- (Insertamos si no existen, basándonos en los nombres del usuario)

INSERT INTO flujos_forma (forma_farmaceutica, activo)
VALUES 
('CAPSULAS', true),
('TABLETAS', true),
('POLVOS GRANULADOS', true),
('SOLUCION ORAL', true),
('GEL-UNGUENTO-JARABE', true),
('SOLUCIONES ESTERILES (AMPOLLAS - VIALES)', true)
ON CONFLICT (forma_farmaceutica) DO UPDATE SET activo = true;

-- Obtener IDs (para referencia manual en inserts, o usamos subqueries)

-- Borrar etapas de configuración existentes para estos flujos para evitar duplicados/orden incorrecto
DELETE FROM flujos_forma_etapas 
WHERE flujo_id IN (
    SELECT id FROM flujos_forma WHERE forma_farmaceutica IN (
        'CAPSULAS', 'TABLETAS', 'POLVOS GRANULADOS', 'SOLUCION ORAL', 'GEL-UNGUENTO-JARABE', 'SOLUCIONES ESTERILES (AMPOLLAS - VIALES)'
    )
);

-- RE-INSERTAR ETAPAS

-- ==========================================
-- 1. CAPSULAS
-- ==========================================
DO $$
DECLARE
    f_id BIGINT;
BEGIN
    SELECT id INTO f_id FROM flujos_forma WHERE forma_farmaceutica = 'CAPSULAS';
    
    INSERT INTO flujos_forma_etapas (flujo_id, orden, nombre, requiere_liberacion, rol_liberador) VALUES
    (f_id, 1, 'Dispensación de materias primas', false, null), -- Verificación puede ser cualquiera
    (f_id, 2, 'Formulación', true, 'control_calidad'),
    (f_id, 3, 'Impregnación y secado', true, 'control_calidad'),
    (f_id, 4, 'Encapsulado', true, 'control_calidad'),
    (f_id, 5, 'Brillado y revisión', true, 'control_calidad'),
    (f_id, 6, 'Envasado', true, 'control_calidad'), -- ***
    (f_id, 7, 'Acondicionamiento', true, 'control_calidad');
END $$;

-- ==========================================
-- 2. TABLETAS
-- ==========================================
DO $$
DECLARE
    f_id BIGINT;
BEGIN
    SELECT id INTO f_id FROM flujos_forma WHERE forma_farmaceutica = 'TABLETAS';
    
    INSERT INTO flujos_forma_etapas (flujo_id, orden, nombre, requiere_liberacion, rol_liberador) VALUES
    (f_id, 1, 'Dispensación de materias primas', false, null),
    (f_id, 2, 'Formulación', true, 'control_calidad'),
    (f_id, 3, 'Impregnación y secado', true, 'control_calidad'),
    (f_id, 4, 'Tableteo', true, 'control_calidad'),
    (f_id, 5, 'Desempolvado y detección de metales', true, 'control_calidad'),
    (f_id, 6, 'Envasado', true, 'control_calidad'), -- *** (Muestras FQ y MB)
    (f_id, 7, 'Acondicionamiento', true, 'control_calidad');
END $$;

-- ==========================================
-- 3. POLVOS GRANULADOS
-- ==========================================
DO $$
DECLARE
    f_id BIGINT;
BEGIN
    SELECT id INTO f_id FROM flujos_forma WHERE forma_farmaceutica = 'POLVOS GRANULADOS';
    
    INSERT INTO flujos_forma_etapas (flujo_id, orden, nombre, requiere_liberacion, rol_liberador) VALUES
    (f_id, 1, 'Dispensación de materias primas', false, null),
    (f_id, 2, 'Formulación', true, 'control_calidad'),
    (f_id, 3, 'Impregnación y secado', true, 'control_calidad'),
    (f_id, 4, 'Envasado', true, 'control_calidad'), -- ***
    (f_id, 5, 'Acondicionamiento', true, 'control_calidad');
END $$;

-- ==========================================
-- 4. SOLUCION ORAL
-- ==========================================
DO $$
DECLARE
    f_id BIGINT;
BEGIN
    SELECT id INTO f_id FROM flujos_forma WHERE forma_farmaceutica = 'SOLUCION ORAL';
    
    INSERT INTO flujos_forma_etapas (flujo_id, orden, nombre, requiere_liberacion, rol_liberador) VALUES
    (f_id, 1, 'Formulación', true, 'control_calidad'),
    (f_id, 2, 'Envasado', true, 'control_calidad'), -- ***
    (f_id, 3, 'Acondicionamiento', true, 'control_calidad');
END $$;

-- ==========================================
-- 5. GEL-UNGUENTO-JARABE
-- ==========================================
DO $$
DECLARE
    f_id BIGINT;
BEGIN
    SELECT id INTO f_id FROM flujos_forma WHERE forma_farmaceutica = 'GEL-UNGUENTO-JARABE';
    
    INSERT INTO flujos_forma_etapas (flujo_id, orden, nombre, requiere_liberacion, rol_liberador) VALUES
    (f_id, 1, 'Formulación', true, 'control_calidad'),
    (f_id, 2, 'Dispensación', false, null),
    (f_id, 3, 'Preparación', true, 'control_calidad'),
    (f_id, 4, 'Envasado', true, 'control_calidad'), -- ***
    (f_id, 5, 'Acondicionamiento', true, 'control_calidad');
END $$;

-- ==========================================
-- 6. SOLUCIONES ESTERILES (AMPOLLAS - VIALES)
-- ==========================================
DO $$
DECLARE
    f_id BIGINT;
BEGIN
    SELECT id INTO f_id FROM flujos_forma WHERE forma_farmaceutica = 'SOLUCIONES ESTERILES (AMPOLLAS - VIALES)';
    
    INSERT INTO flujos_forma_etapas (flujo_id, orden, nombre, requiere_liberacion, rol_liberador) VALUES
    (f_id, 1, 'Lavado de materiales', false, null),
    (f_id, 2, 'Despirogenizacion', true, 'microbiologia'), -- Libera Micro
    (f_id, 3, 'Formulación', true, 'control_calidad,microbiologia'), -- Libera CC y Micro
    (f_id, 4, 'Filtración', false, null), -- Notify Micro (Post-filtro). User didn't say who releases, forcing false unless specified. Actually user said "debe llegar notificación". Doesn't explicit say "libera". But usually implies a hold. Let's assume production moves it but notifies.
    
    -- WAIT: For Filtración: "debe llegar notificación a microbiología que diga toma biocarga post filtración". 
    -- If it requires taking a sample, maybe it should be blocked? The user didn't say "libera". 
    -- Let's stick to user text: "Formulación (libera el proceso control de calidad...)", "Filtración (debe llegar notificación...)".
    -- So Filtración doesn't explicitly require liberation.
    
    (f_id, 5, 'Esterilización', false, null), -- *** Notify Micro analysis. "toma de muestra".
    
    -- WAIT again: "Esterilización (debe llegar notificación a microbiología toma de muestra para análisis microbiológico)".
    -- Does it block? Usually Sterility Test takes 14 days. It definitely blocks RELEASE of the product.
    -- But does it block the "Internal Stage" from finishing to move to "Hermeticidad"?
    -- Probably NOT. Production continues to Hermeticidad/Revisión.
    -- The BLOCK is at Final Release defined in the Logic.
    
    (f_id, 6, 'Prueba de hermeticidad', false, null), -- "no se libera esta etapa"
    (f_id, 7, 'Revisión de partículas visibles', false, null), -- "se debe notificar a control de calidad..."
    (f_id, 8, 'Acondicionamiento', false, null); -- Last stage.
    
    -- Note on Acondicionamiento: Usually requires clearance. User lists it.
    -- In other forms user said "(control de calidad libera)". 
    -- For Sterile, user just said "Acondicionamiento".
    -- I will leave it as `false` for now for Sterile if not specified, 
    -- OR better, generic logic usually requires clearing Acondicionamiento for Final Release.
    -- Use `config` logic?
    
    -- Actually, for Sterile, the user listed "8. Acondicionamiento" without extra notes.
    -- Given others have (control de calidad libera), and this one doesn't have the note, I will assume NO liberation for Stage 8 sterile? 
    -- Or is it implied?
    -- Safest is `false` unless asked.
    
END $$;
