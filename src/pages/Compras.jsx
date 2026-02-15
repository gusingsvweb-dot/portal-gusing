// src/pages/Compras.jsx
import React, { useEffect, useState } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase } from "../api/supabaseClient";
import { useAuth } from "../context/AuthContext";
import "./Compras.css";

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
      .from("solicitudes")
      .select(`
        *,
        tipos_solicitud ( nombre ),
        prioridades ( nombre ),
        estados ( nombre ),
        areas ( nombre )
      `)
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
  async function solicitarCorreccion() {
    if (!selected) return;
    if (!comentario.trim()) { setError("Comentario requerido"); return; }
    // Devolvemos a 16 (Asignacion)
    await updateEstado(selected.id, 16, {
      estado_aprobacion: "DEVUELTO",
      comentario_compras: comentario
    });
  }

  // 23 -> 24
  async function enviarOrdenRevision() {
    if (!selected) return;
    if (!accion.trim()) { setError("Indica el número de orden o detalle"); return; } // Usamos 'accion' como input temporal

    // Guardamos la info de la orden como comentario o accion_realizada?
    // Usaremos 'accion_realizada' temporalmente o un comentario
    await updateEstado(selected.id, 24, {
      comentario_compras: `Orden Generada: ${accion}`,
      // Podriamos actualizar un campo de la solicitud si existiera 'numero_orden'
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
      await supabase.from("aprobaciones").upsert(payload, { onConflict: "solicitud_id" });
    }

    // 2. Actualizar solicitud
    const updatePayload = { estado_id: nuevoEstado };
    if (extraFields.accion_realizada) updatePayload.accion_realizada = extraFields.accion_realizada;
    if (extraFields.fecha_cierre) updatePayload.fecha_cierre = extraFields.fecha_cierre;

    const { error } = await supabase.from("solicitudes").update(updatePayload).eq("id", id);

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
                <div className="action-area">
                  <h4>Gestión Inicial</h4>
                  <textarea className="comp-textarea"
                    placeholder="Comentario..."
                    value={comentario}
                    onChange={e => setComentario(e.target.value)}
                  />
                  {error && <p className="error-msg">{error}</p>}
                  <div className="modal-footer-actions">
                    <button className="btn-reject" onClick={solicitarCorreccion}>Solicitar Corrección</button>
                    <button className="btn-approve" onClick={enviarGerencia}>Aprobar (Enviar a Gerencia)</button>
                  </div>
                </div>
              )}

              {/* 23: Crear OC -> 24 */}
              {selected.estado_id === 23 && (
                <div className="action-area">
                  <h4>Generación de Orden de Compra</h4>
                  <p className="note-text">Ingresa el número de orden o una referencia.</p>
                  <textarea className="comp-textarea"
                    placeholder="Ej: Orden #12345 adjunta..."
                    value={accion}
                    onChange={e => setAccion(e.target.value)}
                  />
                  {error && <p className="error-msg">{error}</p>}
                  <div className="modal-footer-actions">
                    <button className="btn-execute" onClick={enviarOrdenRevision}>Enviar Orden a Revisión</button>
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
  return (
    <>
      <div className="info-grid">
        <div><strong>Usuario:</strong> <p>{data.usuario_id}</p></div>
        <div><strong>Área:</strong> <p>{data.areas?.nombre}</p></div>
        <div><strong>Fecha:</strong> <p>{new Date(data.created_at).toLocaleDateString()}</p></div>
      </div>
      <div className="desc-section">
        <h4>Descripción</h4>
        <div className="text-box">{data.descripcion}</div>
      </div>
    </>
  )
}
