// src/pages/Compras.jsx
import React, { useEffect, useState } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase, st, ss } from "../api/supabaseClient";
import { useAuth } from "../context/AuthContext";
import "./Compras.css";
import GestionRevisionCompras from "../components/compras/GestionRevisionCompras";

export default function Compras() {
  const { usuarioActual } = useAuth();

  const [solicitudes, setSolicitudes] = useState([]);
  const [selected, setSelected] = useState(null);

  const [comentario, setComentario] = useState("");
  const [accion, setAccion] = useState("");
  const [error, setError] = useState("");

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
    // 1(Pendiente), 17(Rev), 18(Ger), 23(CrearOC), 24(RevOC), 19(Comprar), 14(Fin)
    const { data, error } = await supabase
      .from(st("solicitudes"))
      .select(ss(`
        *,
        tipos_solicitud ( nombre ),
        prioridades ( nombre ),
        estados ( nombre ),
        areas ( nombre ),
        compras_solicitudes_detalle ( * ),
        compras_solicitud_items ( * )
      `))
      .eq("area_id", 4)
      .in("estado_id", [1, 14, 17, 18, 19, 23, 24])
      .order("id", { ascending: false });

    if (!error) setSolicitudes(data || []);
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

  // 23 -> 24
  async function enviarOrdenRevision() {
    if (!selected) return;
    
    setError("");
    const { data: numOC, error: errRpc } = await supabase.rpc("rpc_compras_generar_numero_oc", {
      p_solicitud_id: selected.id,
      p_creador_id: usuarioActual?.id || usuarioActual?.usuario
    });

    if (errRpc) {
      setError(`Error generando Orden de Compra: ${errRpc.message}`);
      return;
    }

    await updateEstado(selected.id, 24, {
      comentario_compras: `Orden de Compra Generada: ${numOC}`,
    });
  }

  // 19 -> 14
  async function ejecutarCompra() {
    if (!selected) return;
    if (!accion.trim()) { setError("Detalle de compra requerido"); return; }

    await updateEstado(selected.id, 14, {
      fecha_cierre: new Date().toISOString(),
      accion_realizada: accion
    });
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
                    // Update state variables for updateEstado to pick up?
                    // Better to just call updateEstado directly with the comment
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
                  <p className="note-text">Se generará la Orden de Compra automáticamente usando el proveedor y cotización seleccionados en Gerencia.</p>
                  {error && <p className="error-msg">{error}</p>}
                  <div className="modal-footer-actions">
                    <button className="btn-execute" onClick={enviarOrdenRevision}>Generar Orden y Enviar a Revisión</button>
                  </div>
                </div>
              )}

              {/* 19: Comprar -> 14 */}
              {selected.estado_id === 19 && (
                <div className="action-area">
                  <h4>Ejecutar Compra</h4>
                  <textarea className="comp-textarea"
                    placeholder="Detalles de la transacción..."
                    value={accion}
                    onChange={e => setAccion(e.target.value)}
                  />
                  {error && <p className="error-msg">{error}</p>}
                  <div className="modal-footer-actions">
                    <button className="btn-execute" onClick={ejecutarCompra}>Finalizar Compra</button>
                  </div>
                </div>
              )}

              {/* Mensaje para Estados Pasivos (18, 24, 14) */}
              {[18, 24, 14].includes(selected.estado_id) && (
                <div className="readonly-msg">
                  Solicitud en estado: <strong>{selected.estados?.nombre}</strong>.
                </div>
              )}

            </div>
          </div>
        </div>
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
