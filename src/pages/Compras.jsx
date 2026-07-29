// src/pages/Compras.jsx
import React, { useEffect, useState } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase, st, ss } from "../api/supabaseClient";
import { useAuth } from "../context/AuthContext";
import "./Compras.css";
import GestionRevisionCompras from "../components/compras/GestionRevisionCompras";
import OrdenCompraPDF from "../components/compras/OrdenCompraPDF";

export default function Compras() {
  const { usuarioActual } = useAuth();

  const [solicitudes, setSolicitudes] = useState([]);
  const [selected, setSelected] = useState(null);

  const [comentario, setComentario] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [showPDF, setShowPDF] = useState(false);
  const [accion, setAccion] = useState("");
  const [error, setError] = useState("");
  const [soporteFile, setSoporteFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const aprobador = usuarioActual?.usuario || usuarioActual?.username || "COMPRAS";

  const APROB_ESTADOS = {
    ENVIADO_GERENCIA: null,
    CORRECCION_SOLICITADA: "DEVUELTO",
    FINALIZADO_COMPRAS: null,
  };

  // ===================================
  // CARGAR SOLICITUDES
  // ===================================
  async function loadSolicitudes() {
    try {
      const [
        { data: solRaw, error: solErr },
        { data: tiposRaw },
        { data: prioRaw },
        { data: estRaw },
        { data: arsRaw }
      ] = await Promise.all([
        supabase
          .from(st("solicitudes"))
          .select(ss(`
            *,
            compras_solicitudes_detalle!inner ( * ),
            compras_solicitud_items ( * ),
            compras_cotizaciones (
              *,
              compras_proveedores ( razon_social, nit )
            ),
            compras_ordenes_compra ( * )
          `))
          .in("estado_id", [1, 14, 17, 18, 19, 23, 24])
          .order("id", { ascending: false }),
        supabase.from(st("tipos_solicitud")).select("*"),
        supabase.from(st("prioridades")).select("*"),
        supabase.from(st("estados")).select("*"),
        supabase.from(st("areas")).select("*")
      ]);

      if (solErr) throw solErr;

      const tMap = new Map(tiposRaw?.map(t => [t.id, t]));
      const pMap = new Map(prioRaw?.map(p => [p.id, p]));
      const eMap = new Map(estRaw?.map(e => [e.id, e]));
      const aMap = new Map(arsRaw?.map(a => [a.id, a]));

      const hydrated = (solRaw || []).map(s => ({
        ...s,
        tipos_solicitud: tMap.get(s.tipo_solicitud_id),
        prioridades: pMap.get(s.prioridad_id),
        estados: eMap.get(s.estado_id),
        areas: aMap.get(s.area_id)
      }));

      setSolicitudes(hydrated);
    } catch (err) {
      console.error("Error cargando compras:", err);
      setSolicitudes([]);
    }
  }

  useEffect(() => { loadSolicitudes(); }, []);

  // ===================================
  // CLASIFICAR KANBAN
  // ===================================  // CLASIFICAR KANBAN
  const revision = solicitudes.filter(s => s.estado_id === 17 || s.estado_id === 1);
  const enGerenciaSol = solicitudes.filter(s => s.estado_id === 18);
  const creacionOC = solicitudes.filter(s => s.estado_id === 23);
  const enGerenciaOrden = solicitudes.filter(s => s.estado_id === 24);
  const porComprar = solicitudes.filter(s => s.estado_id === 19);
  const finalizados = solicitudes.filter(s => s.estado_id === 14);

  // ===================================
  // ACTIONS
  // ===================================

  // 17 -> 18
  async function enviarGerencia() {
    if (!selected) return;
    await updateEstado(selected.id, 18, { comentario_compras: comentario });
  }

  // 17 -> 16 or 23 -> 18? (Devoluciones)
  async function solicitarCorreccion(comentarioDesdeHijo = "") {
    if (!selected) return;
    const finalComment = comentarioDesdeHijo || comentario;
    if (!finalComment.trim()) { setError("Comentario requerido"); return; }
    // Devolvemos a 16 (Asignacion)
    await updateEstado(selected.id, 16, {
      estado_aprobacion: "DEVUELTO",
      comentario_compras: finalComment
    });
  }

  // 23 (Generar Borrador)
  async function generarOrdenBorrador() {
    if (!selected) return;
    
    setError("");

    const detalle = selected.compras_solicitudes_detalle?.[0];
    
    // Fallback: si por alguna razón no se guardó la cotización seleccionada, usar la primera
    let cotizacionId = detalle?.cotizacion_seleccionada_id;
    if (!cotizacionId && selected.compras_cotizaciones?.length > 0) {
      cotizacionId = selected.compras_cotizaciones[0].id;
    }
    
    // Buscar el proveedor asociado a esa cotización
    const cotizacion = selected.compras_cotizaciones?.find(c => c.id === cotizacionId);
    const proveedorId = cotizacion?.proveedor_id;

    if (!cotizacionId || !proveedorId) {
      setError("Falta seleccionar cotización o proveedor en pasos anteriores.");
      return;
    }

    // Obtener consecutivo maximo
    const { data: maxResult } = await supabase
      .from("compras_ordenes_compra")
      .select("consecutivo_numero")
      .order("consecutivo_numero", { ascending: false })
      .limit(1);

    const nextConsecutivo = (maxResult && maxResult.length > 0 && maxResult[0].consecutivo_numero) 
      ? maxResult[0].consecutivo_numero + 1 
      : 1;
    const currentYear = new Date().getFullYear();

    const numOC = `OC-${nextConsecutivo}`;

    // Insertar OC
    const { error: errInsert } = await supabase.from(st("ordenes_compra")).insert({
      solicitud_id: selected.id,
      proveedor_id: proveedorId,
      cotizacion_id: cotizacionId,
      numero_oc: numOC,
      consecutivo_numero: nextConsecutivo,
      consecutivo_anio: currentYear
    });

    if (errInsert) {
      // Intenta con el nombre base si falló el alias, o maneja el error general.
      const { data: retryData, error: errRetry } = await supabase.from("compras_ordenes_compra").insert({
        solicitud_id: selected.id,
        proveedor_id: proveedorId,
        cotizacion_id: cotizacionId,
        numero_oc: numOC,
        consecutivo_numero: nextConsecutivo,
        consecutivo_anio: currentYear
      }).select();
      
      if (errRetry) {
        setError(`Error creando OC: ${errRetry.message}`);
        return;
      }
      
      // Update local state to show the draft
      setSelected({
        ...selected,
        compras_ordenes_compra: retryData
      });
    } else {
      // We need to fetch the inserted data since we didn't use .select() on errInsert attempt, or just reload everything
      loadSolicitudes();
      // For immediate UI update in modal:
      setSelected({
        ...selected,
        compras_ordenes_compra: [{
          solicitud_id: selected.id,
          proveedor_id: proveedorId,
          cotizacion_id: cotizacionId,
          numero_oc: numOC,
          consecutivo_numero: nextConsecutivo,
          consecutivo_anio: currentYear
        }]
      });
    }
  }

  async function enviarGerenciaOC() {
    if (!selected) return;
    const oc = selected.compras_ordenes_compra?.[0];
    await updateEstado(selected.id, 24, {
      comentario_compras: `Orden de Compra Generada: ${oc?.numero_oc}`,
    });
  }

  // 19 -> 14
  async function ejecutarCompra() {
    if (!selected) return;
    if (!accion.trim() && !soporteFile) { setError("Soporte de pago o detalle de compra requerido"); return; }

    setError("");
    setIsUploading(true);

    let urlSoporte = "";
    if (soporteFile) {
      const fileName = `${selected.id}_${Date.now()}_${soporteFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from("compras_adjuntos")
        .upload(`soportes_pago/${fileName}`, soporteFile, { cacheControl: '3600', upsert: false });
      
      if (uploadError) {
        setError(`Error subiendo archivo: ${uploadError.message}`);
        setIsUploading(false);
        return;
      }
      
      const { data: publicUrlData } = supabase.storage
        .from("compras_adjuntos")
        .getPublicUrl(`soportes_pago/${fileName}`);
        
      urlSoporte = publicUrlData.publicUrl;

      await supabase.from("compras_adjuntos").insert([{
        solicitud_id: selected.id,
        tipo: 'SOPORTE_PAGO',
        path: urlSoporte,
        nombre: soporteFile.name,
        mime_type: soporteFile.type,
        tamano: soporteFile.size
      }]);
    }

    const finalAccion = [accion, urlSoporte ? `Soporte de pago adjunto: ${urlSoporte}` : ""].filter(Boolean).join("\n\n");

    await updateEstado(selected.id, 14, {
      fecha_cierre: new Date().toISOString(),
      accion_realizada: finalAccion
    });
    
    setIsUploading(false);
  }

  // HELPER GENERICO
  async function updateEstado(id, nuevoEstado, extraFields = {}) {
    setError("");

    // 1. Guardar en aprobaciones si es necesario
    if (extraFields.comentario_compras || extraFields.estado_aprobacion) {
      const payload = {
        solicitud_id: id,
        aprobador_id: aprobador,
        fecha_aprobacion: new Date().toISOString(),
        comentario_compras: extraFields.comentario_compras || null,
        estado_aprobacion: extraFields.estado_aprobacion || null
      };
      // Upsert simple logic
      await supabase.from(st("aprobaciones")).upsert(payload, { onConflict: "solicitud_id" });
    }

    // 2. Actualizar solicitud
    const updatePayload = { estado_id: nuevoEstado };
    if (extraFields.accion_realizada) updatePayload.accion_realizada = extraFields.accion_realizada;
    if (extraFields.fecha_cierre) updatePayload.fecha_cierre = extraFields.fecha_cierre;

    const { error } = await supabase.from(st("solicitudes")).update(updatePayload).eq("id", id);

    if (error) {
      setError(error.message);
    } else {
      closeModal();
      loadSolicitudes();
    }
  }

  const closeModal = () => {
    setSelected(null);
    setComentario("");
    setAccion("");
    setError("");
    setSoporteFile(null);
  };

  return (
    <>
      <Navbar />
      <div className="comp-container">
        <h2 className="comp-title">🛒 Flujo de Compras</h2>

        <div className="comp-board">
          {/* 1. REVISION (17) */}
          <div className="comp-column">
            <h3 className="col-header revision">Por Revisar ({revision.length})</h3>
            <div className="comp-list-area">
              {revision.map(s => <Card key={s.id} data={s} onClick={() => setSelected(s)} />)}
            </div>
          </div>

          {/* 2. EN GERENCIA - SOLICITUD (18) */}
          <div className="comp-column">
            <h3 className="col-header gerencia">Gerencia (Sol) ({enGerenciaSol.length})</h3>
            <div className="comp-list-area">
              {enGerenciaSol.map(s => <Card key={s.id} data={s} onClick={() => setSelected(s)} />)}
            </div>
          </div>

          {/* 3. CREAR OC (23) */}
          <div className="comp-column">
            <h3 className="col-header oc">Crear OC ({creacionOC.length})</h3>
            <div className="comp-list-area">
              {creacionOC.map(s => <Card key={s.id} data={s} onClick={() => setSelected(s)} />)}
            </div>
          </div>

          {/* 4. EN GERENCIA - ORDEN (24) */}
          <div className="comp-column">
            <h3 className="col-header gerencia">Gerencia (OC) ({enGerenciaOrden.length})</h3>
            <div className="comp-list-area">
              {enGerenciaOrden.map(s => <Card key={s.id} data={s} onClick={() => setSelected(s)} />)}
            </div>
          </div>

          {/* 5. POR COMPRAR (19) */}
          <div className="comp-column">
            <h3 className="col-header comprar">Por Comprar ({porComprar.length})</h3>
            <div className="comp-list-area">
              {porComprar.map(s => <Card key={s.id} data={s} onClick={() => setSelected(s)} />)}
            </div>
          </div>

          {/* 6. FINALIZADOS (14) */}
          <div className="comp-column">
            <h3 className="col-header finished">Fin ({finalizados.length})</h3>
            <div className="comp-list-area">
              {finalizados.map(s => <Card key={s.id} data={s} onClick={() => setSelected(s)} />)}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL */}
      {selected && (
        <div className="comp-modal-overlay" onClick={closeModal}>
          <div className="comp-modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={closeModal}>✖</button>

            <div className="modal-header">
              <h3>{selected.consecutivo ? `C-${selected.consecutivo}` : `#${selected.id}`} - {selected.tipos_solicitud?.nombre}</h3>
              <span className={`status-badge status-${selected.estado_id}`}>
                {selected.estados?.nombre}
              </span>
            </div>

            <div className="modal-body">
              <InfoGrid data={selected} />

              {/* ACCIONES */}

              {/* 17: Revision -> 18 */}
              {selected.estado_id === 17 && (
                <GestionRevisionCompras
                  solicitud={selected}
                  onAprobar={(coment) => {
                    updateEstado(selected.id, 18, { comentario_compras: coment });
                  }}
                  onRechazar={solicitarCorreccion}
                  errorG={error}
                />
              )}

              {/* 23: Crear OC -> 24 */}
              {selected.estado_id === 23 && (
                <div className="action-area">
                  <h4>Generación de Orden de Compra</h4>
                  
                  {selected.compras_ordenes_compra && selected.compras_ordenes_compra.length > 0 ? (
                    <>
                      <p className="note-text" style={{ color: '#166534' }}>✅ Orden de compra generada en borrador. Revísala antes de enviarla.</p>
                      {error && <p className="error-msg">{error}</p>}
                      <div className="modal-footer-actions">
                        <button className="btn-execute" onClick={() => setShowPDF(true)} style={{ backgroundColor: '#64748b' }}>📄 Revisar PDF (Borrador)</button>
                        <button className="btn-execute" onClick={enviarGerenciaOC}>Enviar a Gerencia (OC)</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="note-text">Se generará la Orden de Compra automáticamente usando el proveedor y cotización seleccionados en Gerencia.</p>
                      {error && <p className="error-msg">{error}</p>}
                      <div className="modal-footer-actions">
                        <button className="btn-execute" onClick={generarOrdenBorrador}>Generar Orden de Compra (Borrador)</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 24: Revisión Gerencia (OC) -> Read only */}
              {selected.estado_id === 24 && (
                <div className="readonly-msg">
                  <p>La Orden de Compra está en <strong>Aprobación por Gerencia</strong>.</p>
                  <button className="btn-execute" onClick={() => setShowPDF(true)} style={{ marginTop: '10px' }}>📄 Ver PDF Orden de Compra</button>
                </div>
              )}

              {/* 19: Por Comprar (OC Aprobada) -> 14 */}
              {selected.estado_id === 19 && (
                <div className="action-area">
                  <h4>Orden de Compra Aprobada</h4>
                  <p className="note-text">Procede con el pago o formalización de la compra.</p>
                  
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <button className="btn-execute" onClick={() => setShowPDF(true)} style={{ flex: 1, backgroundColor: '#3b82f6' }}>📄 Ver PDF Orden</button>
                  </div>

                  <div style={{ marginBottom: "10px" }}>
                    <label style={{ display: "block", marginBottom: "5px", fontWeight: "600", fontSize: "0.85rem", color: "#475569" }}>Adjuntar Soporte de Pago</label>
                    <input type="file" onChange={(e) => setSoporteFile(e.target.files[0])} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#1e293b", colorScheme: "light" }} />
                  </div>

                  <textarea className="comp-textarea"
                    placeholder="Soporte de pago o link (Opcional si subes archivo)..."
                    value={accion}
                    onChange={e => setAccion(e.target.value)}
                  />
                  {error && <p className="error-msg">{error}</p>}
                  <div className="modal-footer-actions">
                    <button className="btn-execute" onClick={ejecutarCompra} disabled={isUploading}>
                      {isUploading ? "Subiendo..." : "Finalizar Compra"}
                    </button>
                  </div>
                </div>
              )}

              {/* 14: Finalizados */}
              {selected.estado_id === 14 && (
                <div className="readonly-msg">
                  <p>Esta solicitud está <strong>FINALIZADA</strong>.</p>
                  <button className="btn-execute" onClick={() => setShowPDF(true)} style={{ marginTop: '10px', backgroundColor: '#64748b' }}>📄 Ver PDF Orden de Compra</button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {showPDF && selected && (
        <OrdenCompraPDF solicitudId={selected.id} onClose={() => setShowPDF(false)} />
      )}
      
      <Footer />
    </>
  );
}

function Card({ data, onClick }) {
  return (
    <div className="comp-card" onClick={onClick}>
      <div className="card-top">
        <span className="card-id">{data.consecutivo ? `C-${data.consecutivo}` : `#${data.id}`}</span>
        <span className="card-priority">{data.prioridades?.nombre}</span>
      </div>
      <h4 className="card-title">{data.tipos_solicitud?.nombre}</h4>
      <p className="card-area">{data.estados?.nombre}</p>
    </div>
  )
}

function InfoGrid({ data }) {
  const isCompras = data.area_id === 4;
  const detalle = data.compras_solicitudes_detalle?.[0];
  const items = data.compras_solicitud_items || [];

  return (
    <>
      <div className="info-grid">
        <div><strong>Usuario:</strong> <p>{data.usuario_id}</p></div>
        <div><strong>Área:</strong> <p>{data.areas?.nombre}</p></div>
        <div><strong>Fecha:</strong> <p>{new Date(data.created_at).toLocaleDateString()}</p></div>
      </div>
      
      {isCompras && detalle && (
        <div className="info-grid" style={{ marginTop: '10px', background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
          <div><strong>Tipo Requisición:</strong> <p>{detalle.tipo_requisicion}</p></div>
          <div><strong>Categoría:</strong> <p>{detalle.categoria_compra}</p></div>
          <div><strong>Estado Compra:</strong> <p>{detalle.estado_compra}</p></div>
        </div>
      )}

      <div className="desc-section">
        <h4>Descripción</h4>
        <div className="text-box">{data.descripcion}</div>
      </div>

      {isCompras && items.length > 0 && (
        <div className="items-section" style={{ marginTop: '15px' }}>
          <h4>Ítems Solicitados</h4>
          <div style={{ overflowX: 'auto', marginTop: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                  <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1' }}>Item</th>
                  <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1' }}>Descripción</th>
                  <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1' }}>Ref.</th>
                  <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1' }}>Cant.</th>
                  <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1' }}>U. Medida</th>
                </tr>
              </thead>
              <tbody>
                {items.sort((a,b) => a.orden - b.orden).map((it, idx) => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px' }}>{it.orden}</td>
                    <td style={{ padding: '8px' }}>{it.descripcion}</td>
                    <td style={{ padding: '8px' }}>{it.referencia || '-'}</td>
                    <td style={{ padding: '8px' }}>{it.cantidad_solicitada}</td>
                    <td style={{ padding: '8px' }}>{it.unidad_medida}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
