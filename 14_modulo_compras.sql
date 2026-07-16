-- ========================================================
-- MIGRACIÓN 14: MÓDULO DE COMPRAS (Laboratorios Gusing)
-- ========================================================

-- 1. ENUMS GLOBALES DEL MÓDULO DE COMPRAS
-- ========================================================
DO $$ BEGIN
    CREATE TYPE compras_categoria_compra AS ENUM ('MATERIA_PRIMA', 'INSUMO', 'MATERIAL_IMPRESO', 'EQUIPO', 'SERVICIO', 'OTRO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE compras_estado_oc AS ENUM ('BORRADOR', 'EN_APROBACION', 'APROBADA', 'RECHAZADA', 'ANULADA');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE compras_estado_pago AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADO', 'NO_APLICA');
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- 2. TABLAS PRINCIPALES
-- ========================================================

-- A. Extensión de Solicitudes (1:1)
CREATE TABLE IF NOT EXISTS compras_solicitudes_detalle (
    solicitud_id BIGINT PRIMARY KEY REFERENCES solicitudes(id) ON DELETE CASCADE,
    estado_compra TEXT NOT NULL DEFAULT 'PENDIENTE', -- Internal Kanban state
    version_fila INTEGER NOT NULL DEFAULT 1,
    consecutivo_oficial TEXT UNIQUE,
    consecutivo_numero INTEGER,
    consecutivo_anio SMALLINT,
    consecutivo_asignado_por UUID REFERENCES auth.users(id),
    consecutivo_asignado_at TIMESTAMPTZ,
    fecha_solicitud DATE NOT NULL DEFAULT CURRENT_DATE,
    cargo_solicitante_snapshot TEXT,
    proceso_solicitante_snapshot TEXT,
    tipo_requisicion TEXT NOT NULL CHECK (tipo_requisicion IN ('MATERIAL', 'EQUIPO', 'SERVICIO')),
    categoria_compra compras_categoria_compra,
    es_critica BOOLEAN NOT NULL DEFAULT false,
    requiere_orden_compra BOOLEAN,
    cotizacion_seleccionada_id UUID,
    excepcion_cotizaciones TEXT NOT NULL DEFAULT 'NONE',
    justificacion_excepcion TEXT,
    fecha_compromiso_entrega DATE,
    compromiso_entrega_texto TEXT,
    fecha_recepcion_final DATE,
    fecha_cierre DATE,
    observaciones_requerimiento TEXT,
    anulada_at TIMESTAMPTZ,
    anulada_por UUID REFERENCES auth.users(id),
    motivo_anulacion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- B. Ítems de la Solicitud
CREATE TABLE IF NOT EXISTS compras_solicitud_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitud_id BIGINT NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
    orden SMALLINT NOT NULL DEFAULT 1,
    referencia TEXT,
    descripcion TEXT NOT NULL,
    equipo_identificacion_interna TEXT,
    stock_actual NUMERIC(14,3),
    cantidad_solicitada NUMERIC(14,3) NOT NULL CHECK (cantidad_solicitada > 0),
    cantidad_aprobada NUMERIC(14,3),
    unidad_medida TEXT NOT NULL,
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- C. Proveedores (Maestro)
CREATE TABLE IF NOT EXISTS compras_proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    razon_social TEXT NOT NULL,
    nit TEXT NOT NULL UNIQUE,
    contacto_nombre TEXT,
    correo_contacto TEXT,
    correo_facturacion TEXT,
    direccion TEXT,
    telefono TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- D. Cotizaciones
CREATE TABLE IF NOT EXISTS compras_cotizaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitud_id BIGINT NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
    proveedor_id UUID NOT NULL REFERENCES compras_proveedores(id),
    numero_cotizacion TEXT,
    fecha_cotizacion DATE NOT NULL DEFAULT CURRENT_DATE,
    vigencia_hasta DATE,
    moneda CHAR(3) DEFAULT 'COP',
    subtotal NUMERIC(16,2),
    descuento NUMERIC(16,2) DEFAULT 0,
    impuestos NUMERIC(16,2) DEFAULT 0,
    total NUMERIC(16,2) NOT NULL,
    fecha_compromiso_entrega DATE,
    compromiso_entrega_texto TEXT,
    condiciones_pago TEXT,
    garantia TEXT,
    archivo_path TEXT,
    cargada_por UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FK Diferida de cotizacion en la solicitud
ALTER TABLE compras_solicitudes_detalle 
ADD CONSTRAINT fk_cotizacion_seleccionada 
FOREIGN KEY (cotizacion_seleccionada_id) REFERENCES compras_cotizaciones(id) ON DELETE SET NULL;

-- E. Ordenes de Compra (FR-CO-07)
CREATE TABLE IF NOT EXISTS compras_ordenes_compra (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitud_id BIGINT NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
    proveedor_id UUID NOT NULL REFERENCES compras_proveedores(id),
    cotizacion_id UUID REFERENCES compras_cotizaciones(id),
    numero_oc TEXT NOT NULL UNIQUE,
    consecutivo_numero INTEGER NOT NULL,
    consecutivo_anio SMALLINT NOT NULL,
    fecha_orden DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_compromiso_entrega DATE,
    compromiso_entrega_texto TEXT,
    numero_cotizacion_snapshot TEXT,
    proveedor_snapshot JSONB,
    moneda CHAR(3) DEFAULT 'COP',
    subtotal NUMERIC(16,2) DEFAULT 0,
    descuento_tipo TEXT DEFAULT 'NINGUNO', -- NINGUNO, PORCENTAJE, VALOR
    descuento_tasa NUMERIC(16,2) DEFAULT 0,
    descuento_valor NUMERIC(16,2) DEFAULT 0,
    base_factura NUMERIC(16,2) DEFAULT 0,
    iva_tasa NUMERIC(16,2) DEFAULT 19,
    iva_valor NUMERIC(16,2) DEFAULT 0,
    retefuente_tasa NUMERIC(16,2) DEFAULT 0,
    retefuente_valor NUMERIC(16,2) DEFAULT 0,
    otros_impuestos_cargos NUMERIC(16,2) DEFAULT 0,
    total_neto NUMERIC(16,2) DEFAULT 0,
    observaciones TEXT,
    estado_oc compras_estado_oc NOT NULL DEFAULT 'BORRADOR',
    estado_pago compras_estado_pago NOT NULL DEFAULT 'PENDIENTE',
    revisada_por UUID REFERENCES auth.users(id),
    revisada_at TIMESTAMPTZ,
    aprobada_por UUID REFERENCES auth.users(id),
    aprobada_at TIMESTAMPTZ,
    motivo_rechazo TEXT,
    enviada_proveedor_at TIMESTAMPTZ,
    enviada_solicitante_at TIMESTAMPTZ,
    pdf_version INTEGER DEFAULT 0,
    pdf_path TEXT,
    pdf_sha256 TEXT,
    pdf_generado_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- F. Ítems de la Orden de Compra
CREATE TABLE IF NOT EXISTS compras_orden_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_compra_id UUID NOT NULL REFERENCES compras_ordenes_compra(id) ON DELETE CASCADE,
    solicitud_item_id UUID REFERENCES compras_solicitud_items(id) ON DELETE SET NULL,
    orden SMALLINT NOT NULL DEFAULT 1,
    cantidad NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
    unidad_medida TEXT NOT NULL,
    concepto TEXT NOT NULL,
    valor_unitario NUMERIC(16,2) NOT NULL,
    valor_total NUMERIC(16,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- G. Recepciones (Entregas parciales o completas)
CREATE TABLE IF NOT EXISTS compras_recepciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitud_id BIGINT NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
    orden_compra_id UUID REFERENCES compras_ordenes_compra(id) ON DELETE CASCADE,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    recibido_por UUID REFERENCES auth.users(id),
    resultado TEXT NOT NULL CHECK (resultado IN ('CONFORME', 'PARCIAL', 'NO_CONFORME')),
    observaciones TEXT,
    factura_numero TEXT,
    factura_path TEXT,
    certificado_path TEXT,
    informe_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- H. Consecutivos (Tablas atómicas para bloqueo y generación)
CREATE TABLE IF NOT EXISTS compras_consecutivos_requisicion (
    anio SMALLINT PRIMARY KEY,
    ultimo_numero INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS compras_consecutivos_oc (
    proveedor_id UUID NOT NULL REFERENCES compras_proveedores(id),
    anio SMALLINT NOT NULL,
    ultimo_numero INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (proveedor_id, anio)
);

-- I. Bitácora / Historial de Eventos
CREATE TABLE IF NOT EXISTS compras_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitud_id BIGINT REFERENCES solicitudes(id) ON DELETE CASCADE,
    orden_compra_id UUID REFERENCES compras_ordenes_compra(id) ON DELETE CASCADE,
    tipo_evento TEXT NOT NULL,
    estado_anterior TEXT,
    estado_nuevo TEXT,
    actor_id UUID REFERENCES auth.users(id),
    actor_rol_snapshot TEXT,
    comentario TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- J. Archivos adjuntos
CREATE TABLE IF NOT EXISTS compras_adjuntos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitud_id BIGINT NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
    orden_compra_id UUID REFERENCES compras_ordenes_compra(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL, -- COTIZACION, FACTURA, CERTIFICADO...
    path TEXT NOT NULL,
    nombre TEXT NOT NULL,
    mime_type TEXT,
    tamano BIGINT,
    cargado_por UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- 3. FUNCIONES RPC (Procedimientos Almacenados Seguros)
-- ========================================================

-- A. Asignar Consecutivo de Solicitud (Uso: Aseguramiento Calidad)
CREATE OR REPLACE FUNCTION rpc_compras_asignar_consecutivo(p_solicitud_id BIGINT, p_actor_id UUID)
RETURNS JSON AS $$
DECLARE
    v_anio SMALLINT := extract(year from current_date);
    v_nuevo_numero INTEGER;
    v_consecutivo_oficial TEXT;
    v_estado_actual INT;
BEGIN
    -- Verificar que la solicitud existe y está en estado 1 (Pendiente)
    SELECT estado_id INTO v_estado_actual FROM solicitudes WHERE id = p_solicitud_id FOR UPDATE;
    IF v_estado_actual != 1 THEN
        RAISE EXCEPTION 'La solicitud no está en estado Pendiente.';
    END IF;

    -- Garantizar registro del año
    INSERT INTO compras_consecutivos_requisicion (anio, ultimo_numero)
    VALUES (v_anio, 0) ON CONFLICT DO NOTHING;

    -- Incrementar y retornar atómicamente
    UPDATE compras_consecutivos_requisicion
    SET ultimo_numero = ultimo_numero + 1
    WHERE anio = v_anio
    RETURNING ultimo_numero INTO v_nuevo_numero;

    -- Formatear a 3 dígitos (Ej: 005)
    v_consecutivo_oficial := TO_CHAR(v_nuevo_numero, 'FM000');

    -- Crear el registro en compras_solicitudes_detalle si no existe
    INSERT INTO compras_solicitudes_detalle (
        solicitud_id, estado_compra, consecutivo_numero, consecutivo_anio, 
        consecutivo_oficial, consecutivo_asignado_por, consecutivo_asignado_at, tipo_requisicion
    ) VALUES (
        p_solicitud_id, 'REVISION_COMPRAS', v_nuevo_numero, v_anio, 
        v_consecutivo_oficial, p_actor_id, NOW(), 'MATERIAL'
    )
    ON CONFLICT (solicitud_id) DO UPDATE SET
        estado_compra = 'REVISION_COMPRAS',
        consecutivo_numero = v_nuevo_numero,
        consecutivo_anio = v_anio,
        consecutivo_oficial = v_consecutivo_oficial,
        consecutivo_asignado_por = p_actor_id,
        consecutivo_asignado_at = NOW();

    -- Actualizar estado general a 17 (Revisión Compras) y registrar consecutivo en solicitudes original
    UPDATE solicitudes 
    SET estado_id = 17, consecutivo = v_nuevo_numero, accion_realizada = 'Radicado asignado'
    WHERE id = p_solicitud_id;

    -- Evento
    INSERT INTO compras_eventos (solicitud_id, tipo_evento, estado_anterior, estado_nuevo, actor_id, comentario)
    VALUES (p_solicitud_id, 'CONSECUTIVO_ASIGNADO', 'PENDIENTE', 'REVISION_COMPRAS', p_actor_id, 'Radicado ' || v_consecutivo_oficial);

    RETURN json_build_object('success', true, 'consecutivo', v_consecutivo_oficial);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ========================================================
-- 4. BUCKET DE STORAGE
-- ========================================================
-- Asegurar que el bucket exista.
INSERT INTO storage.buckets (id, name, public) VALUES ('compras_adjuntos', 'compras_adjuntos', false) ON CONFLICT DO NOTHING;

-- Políticas de RLS en storage.objects
CREATE POLICY "Accesos a compras_adjuntos para usuarios logueados" ON storage.objects
FOR ALL USING (bucket_id = 'compras_adjuntos' AND auth.role() = 'authenticated');

-- ========================================================
-- 5. POLÍTICAS RLS (Seguridad en tablas base)
-- ========================================================
-- Habilitar RLS en las nuevas tablas
ALTER TABLE compras_solicitudes_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras_solicitud_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras_proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras_cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras_ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras_orden_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras_recepciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras_eventos ENABLE ROW LEVEL SECURITY;

-- Permitir a usuarios logueados ver/editar el módulo (El RBAC se gestiona por UI y endpoints, limitamos por ser authed)
CREATE POLICY "Authed full access compras_solicitudes_detalle" ON compras_solicitudes_detalle FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authed full access compras_solicitud_items" ON compras_solicitud_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authed full access compras_proveedores" ON compras_proveedores FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authed full access compras_cotizaciones" ON compras_cotizaciones FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authed full access compras_ordenes_compra" ON compras_ordenes_compra FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authed full access compras_orden_items" ON compras_orden_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authed full access compras_recepciones" ON compras_recepciones FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authed read compras_eventos" ON compras_eventos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authed insert compras_eventos" ON compras_eventos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
