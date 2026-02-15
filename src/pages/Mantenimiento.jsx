import React, { useEffect, useState } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase } from "../api/supabaseClient";
import { useAuth } from "../context/AuthContext";
import "./Mantenimiento.css";

export default function Mantenimiento() {
  const { usuarioActual } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [accion, setAccion] = useState("");
  const [error, setError] = useState("");

  // ============================
  // CARGAR SOLICITUDES
  // ============================
  async function loadSolicitudes() {
    const { data, error } = await supabase
      .from("solicitudes")
      .select(`
        *,
        tipos_solicitud ( nombre ),
        prioridades ( nombre ),
        estados ( nombre ),
        area_destino:areas ( nombre ),
        area_solicitante
      `)
      .eq("area_id", 1) // 🔥 SOLO MANTENIMIENTO
      .order("id", { ascending: false });

    if (!error) setSolicitudes(data || []);
  }

  useEffect(() => {
    loadSolicitudes();
  }, []);

  // ============================
  // CLASIFICAR SOLICITUDES
  // ============================
  const pendientes = solicitudes.filter(s => s.estado_id === 1);
  const enProceso = solicitudes.filter(s => s.estado_id === 13);
  const finalizados = solicitudes.filter(s => [14, 15].includes(s.estado_id));

  // ============================
  // AVANZAR ESTADO
  // ============================
  async function avanzarEstado() {
    if (!selected) return;

    const current = selected.estado_id;
    const next = {
      1: 13,  // Pendiente → En proceso
      13: 14, // En proceso → Finalizado
      14: 15, // Finalizado → Calificado
      15: 15
    }[current];

    const update = { estado_id: next };

    // Si finaliza → requiere acción
    if (next === 14) {
      if (!accion.trim()) {
        setError("Debes registrar la acción realizada.");
        return;
      }
      update.accion_realizada = accion;
      update.fecha_cierre = new Date().toISOString();
    }

    const { error } = await supabase
      .from("solicitudes")
      .update(update)
      .eq("id", selected.id);

    if (error) {
      alert("Error guardando: " + error.message);
      return;
    }

    setAccion("");
    setError("");
    setSelected(null);
    loadSolicitudes();
  }

  // Helper para cerrar modal
  const closeModal = () => {
    setSelected(null);
    setAccion("");
    setError("");
  };

  return (
    <>
      <Navbar />

      <div className="mant-container">
        <h2 className="mant-title">🔧 Tablero de Mantenimiento</h2>

        <div className="mant-board">
          {/* COLUMNA PENDIENTES */}
          <div className="mant-column">
            <h3 className="col-header pending">
              Pendientes <span className="count">{pendientes.length}</span>
            </h3>
            <div className="mant-list-area">
              {pendientes.map((s) => (
                <Card key={s.id} data={s} onClick={() => setSelected(s)} />
              ))}
              {pendientes.length === 0 && <p className="empty-msg">Sin pendientes</p>}
            </div>
          </div>

          {/* COLUMNA EN PROCESO */}
          <div className="mant-column">
            <h3 className="col-header process">
              En Proceso <span className="count">{enProceso.length}</span>
            </h3>
            <div className="mant-list-area">
              {enProceso.map((s) => (
                <Card key={s.id} data={s} onClick={() => setSelected(s)} />
              ))}
              {enProceso.length === 0 && <p className="empty-msg">Nada en curso</p>}
            </div>
          </div>

          {/* COLUMNA FINALIZADOS */}
          <div className="mant-column">
            <h3 className="col-header done">
              Finalizados <span className="count">{finalizados.length}</span>
            </h3>
            <div className="mant-list-area">
              {finalizados.map((s) => (
                <Card key={s.id} data={s} onClick={() => setSelected(s)} />
              ))}
              {finalizados.length === 0 && <p className="empty-msg">--</p>}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DETALLE */}
      {selected && (
        <div className="mant-modal-overlay" onClick={closeModal}>
          <div className="mant-modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={closeModal}>✖</button>

            <div className="modal-header">
              <h3>{selected.consecutivo ? `M-${selected.consecutivo}` : `#${selected.id}`} - {selected.tipos_solicitud?.nombre}</h3>
              <span className={`status-badge status-${selected.estado_id}`}>
                {selected.estados?.nombre}
              </span>
            </div>

            <div className="modal-body">
              <div className="info-grid">
                <div>
                  <strong>Area Solicitante:</strong>
                  <p>{selected.area_solicitante}</p>
                </div>
                <div>
                  <strong>Prioridad:</strong>
                  <p>{selected.prioridades?.nombre}</p>
                </div>
                <div>
                  <strong>Usuario:</strong>
                  <p>{selected.usuario_id}</p>
                </div>
                <div>
                  <strong>Fecha:</strong>
                  <p>{new Date(selected.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="desc-section">
                <h4>Descripción</h4>
                <div className="text-box">{selected.descripcion}</div>
              </div>

              {selected.justificacion && (
                <div className="desc-section">
                  <h4>Justificación</h4>
                  <div className="text-box">{selected.justificacion}</div>
                </div>
              )}

              {/* Acción Realizada (Mostrar si existe) */}
              {selected.accion_realizada && (
                <div className="desc-section">
                  <h4>Acción Realizada</h4>
                  <div className="text-box action-box">{selected.accion_realizada}</div>
                </div>
              )}

              {/* INPUT ACCIÓN (Solo si está terminando) */}
              {selected.estado_id === 13 && (
                <div className="action-input-area">
                  <h4>Registrar Acción (Requerido para finalizar)</h4>
                  <textarea
                    className="mant-textarea"
                    value={accion}
                    onChange={(e) => setAccion(e.target.value)}
                    placeholder="Describe el trabajo realizado..."
                  />
                  {error && <p className="error-msg">{error}</p>}
                </div>
              )}
            </div>

            <div className="modal-footer">
              {selected.estado_id < 14 && (
                <button className="mant-btn primary" onClick={avanzarEstado}>
                  {selected.estado_id === 1 ? "Iniciar Trabajo" : "Finalizar Solicitud"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}

// Subcomponente simple para la tarjeta
function Card({ data, onClick }) {
  return (
    <div className="mant-card" onClick={onClick}>
      <div className="card-top">
        <span className="card-id">{data.consecutivo ? `M-${data.consecutivo}` : `#${data.id}`}</span>
        <span className="card-priority">{data.prioridades?.nombre}</span>
      </div>
      <h4 className="card-title">{data.tipos_solicitud?.nombre}</h4>
      <p className="card-area">{data.area_solicitante}</p>
    </div>
  );
}
