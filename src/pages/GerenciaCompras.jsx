// src/pages/GerenciaCompras.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom"; // Importar hook
import "./GerenciaCompras.css";

export default function GerenciaCompras() {
  const { usuarioActual } = useAuth();
  const navigate = useNavigate(); // Hook de navegación

  const [solicitudes, setSolicitudes] = useState([]);
  const [selected, setSelected] = useState(null);

  const [comentarioGerencia, setComentarioGerencia] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");

  // =============================
  // CARGAR SOLICITUDES (18, 23, 24, 19, 14)
  // =============================
  async function loadSolicitudes() {
    setError("");

    // OJO: Traemos todo el flujo de supervision
    const { data, error } = await supabase
      .from("solicitudes")
      .select(`
        *,
        tipos_solicitud ( nombre ),
        prioridades ( nombre ),
        estados ( nombre ),
        areas ( nombre )
      `)
      .eq("area_id", 4) // destino Compras
      .in("estado_id", [14, 18, 19, 23, 24])
      .order("id", { ascending: false });

    if (!error) setSolicitudes(data || []);
  }

  useEffect(() => { loadSolicitudes(); }, []);

  // FILTRO BÚSQUEDA
  const solicitudesFiltradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return solicitudes;
    return solicitudes.filter((s) => {
      const blob = `${s.id} ${s.consecutivo ?? ""} ${s.usuario_id ?? ""} ${s.area_solicitante ?? ""} ${s.tipos_solicitud?.nombre ?? ""
        }`.toLowerCase();
      return blob.includes(t);
    });
  }, [busqueda, solicitudes]);

  // CATEGORIZAR COLUMNAS

  // 1. Solicitudes por Aprobar (18) - ACTION
  const solPendientes = solicitudesFiltradas.filter(s => s.estado_id === 18);

  // 2. Compras creando Orden (23) - READ ONLY
  const creandoOC = solicitudesFiltradas.filter(s => s.estado_id === 23);

  // 3. Ordenes por Aprobar (24) - ACTION
  const ordenesPendientes = solicitudesFiltradas.filter(s => s.estado_id === 24);

  // 4. Compras ejecutando pago (19) - READ ONLY
  const pagando = solicitudesFiltradas.filter(s => s.estado_id === 19);

  // 5. Finalizados (14)
  const finalizados = solicitudesFiltradas.filter(s => s.estado_id === 14);

  // =============================
  // LOGICA APROBACION
  // =============================
  async function getAprobadorId() {
    const posible = usuarioActual?.usuario || usuarioActual?.id || null;
    if (posible) return posible;
    const { data } = await supabase.auth.getUser();
    return data?.user?.email || null;
  }

  async function saveAprobacion({ solicitudId, aprobadorId, estadoAprobacion, comentario }) {
    const permitidos = ["APROBADO", "RECHAZADO", "DEVUELTO"];
    if (!permitidos.includes(estadoAprobacion)) throw new Error(`Estado inválido: ${estadoAprobacion}`);

    const payload = {
      solicitud_id: solicitudId,
      aprobador_id: aprobadorId,
      estado_aprobacion: estadoAprobacion,
      comentario_gerencia: comentario || null,
      fecha_aprobacion: new Date().toISOString(),
    };

    // 1. Verificar si existe registro previo
    const { data: existing, error: errFind } = await supabase
      .from("aprobaciones")
      .select("id")
      .eq("solicitud_id", solicitudId)
      .maybeSingle();

    if (errFind) throw errFind;

    // 2. Insertar o Actualizar manualmente
    if (existing) {
      const { error } = await supabase
        .from("aprobaciones")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("aprobaciones")
        .insert(payload);
      if (error) throw error;
    }
  }

  // ACCIONES

  async function aprobar() {
    if (!selected) return;
    setError("");

    try {
      const aprobadorId = await getAprobadorId();
      if (!aprobadorId) { alert("No se encontró usuario."); return; }

      await saveAprobacion({
        solicitudId: selected.id,
        aprobadorId,
        estadoAprobacion: "APROBADO",
        comentario: comentarioGerencia?.trim() || null,
      });

      // LÓGICA DE TRANSICIÓN:
      // Si está en 18 (Rev Solicitud) -> Pasa a 23 (Creacion OC)
      // Si está en 24 (Rev Orden) -> Pasa a 19 (Por Comprar)

      let nextState = 19; // Default fallback
      if (selected.estado_id === 18) nextState = 23;
      if (selected.estado_id === 24) nextState = 19;

      const { error: errSol } = await supabase
        .from("solicitudes")
        .update({ estado_id: nextState })
        .eq("id", selected.id);

      if (errSol) throw errSol;

      closeModal();
      loadSolicitudes();
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
  }

  // Rechazar / Devolver -> mandan a 17 (Compras) para reiniciar
  async function rechazar() {
    if (!selected) return;
    setError("");
    if (!comentarioGerencia.trim()) { setError("Comentario obligatorio."); return; }

    try {
      const aprobadorId = await getAprobadorId();
      if (!aprobadorId) { alert("No se encontró usuario."); return; }

      await saveAprobacion({
        solicitudId: selected.id,
        aprobadorId,
        estadoAprobacion: "RECHAZADO",
        comentario: comentarioGerencia.trim(),
      });

      await supabase.from("solicitudes").update({ estado_id: 17 }).eq("id", selected.id);
      closeModal();
      loadSolicitudes();
    } catch (e) { console.error(e); alert(e.message); }
  }

  const closeModal = () => {
    setSelected(null);
    setComentarioGerencia("");
    setError("");
  };

  return (
    <>
      <Navbar />
      <div className="gcg-container">
        <div className="gcg-header-row">
          <h2 className="gcg-title">📌 Gerencia de Compras</h2>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              className="gcg-btn-kpi"
              onClick={() => navigate("/kpis-compras")}
              style={{
                backgroundColor: "#7c3aed",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "bold"
              }}
            >
              📊 Ver KPIs
            </button>
            <input className="gcg-search" placeholder="🔍 Buscar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
        </div>

        <div className="gcg-board">
          {/* 1. SOLICITUDES PENDIENTES (18) */}
          <div className="gcg-column">
            <h3 className="col-header pending">Solicitudes ({solPendientes.length})</h3>
            <div className="gcg-list-area">
              {solPendientes.map(s => <Card key={s.id} data={s} onClick={() => setSelected(s)} />)}
            </div>
          </div>

          {/* 2. CREANDO OC (23) */}
          <div className="gcg-column">
            <h3 className="col-header process">Creando OC ({creandoOC.length})</h3>
            <div className="gcg-list-area">
              {creandoOC.map(s => <Card key={s.id} data={s} onClick={() => setSelected(s)} />)}
            </div>
          </div>

          {/* 3. ORDENES PENDIENTES (24) */}
          <div className="gcg-column">
            <h3 className="col-header pending">Órdenes ({ordenesPendientes.length})</h3>
            <div className="gcg-list-area">
              {ordenesPendientes.map(s => <Card key={s.id} data={s} onClick={() => setSelected(s)} />)}
            </div>
          </div>

          {/* 4. POR PAGAR (19) */}
          <div className="gcg-column">
            <h3 className="col-header process">Pagando ({pagando.length})</h3>
            <div className="gcg-list-area">
              {pagando.map(s => <Card key={s.id} data={s} onClick={() => setSelected(s)} />)}
            </div>
          </div>

          {/* 5. FINALIZADOS (14) */}
          <div className="gcg-column">
            <h3 className="col-header finished">Fin ({finalizados.length})</h3>
            <div className="gcg-list-area">
              {finalizados.map(s => <Card key={s.id} data={s} onClick={() => setSelected(s)} />)}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL */}
      {selected && (
        <div className="gcg-modal-overlay" onClick={closeModal}>
          <div className="gcg-modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={closeModal}>✖</button>

            <div className="modal-header">
              <h3>{selected.consecutivo ? `C-${selected.consecutivo}` : `#${selected.id}`} - {selected.tipos_solicitud?.nombre}</h3>
              <span className={`status-badge status-${selected.estado_id}`}>
                {selected.estados?.nombre}
              </span>
            </div>

            <div className="modal-body">
              <InfoGrid data={selected} />

              {/* SI STATE ES 18 o 24, mostrar botones APROBAR */}
              {[18, 24].includes(selected.estado_id) ? (
                <div className="action-area">
                  <h4>
                    {selected.estado_id === 18 ? "Aprobación de Solicitud" : "Aprobación de Orden de Compra"}
                  </h4>
                  <textarea
                    className="gcg-textarea"
                    value={comentarioGerencia}
                    onChange={e => setComentarioGerencia(e.target.value)}
                    placeholder="Comentario..."
                  />
                  {error && <p className="error-msg">{error}</p>}

                  <div className="modal-footer-actions">
                    <button className="btn-reject" onClick={rechazar}>✖ Devolver a Compras</button>
                    <button className="btn-approve" onClick={aprobar}>
                      {selected.estado_id === 18 ? "✔ Aprobar Solicitud" : "✔ Aprobar Orden"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="readonly-msg">
                  Solo lectura. Estado actual: <strong>{selected.estados?.nombre}</strong>
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
    <div className="gcg-card" onClick={onClick}>
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
        <div><strong>Solicitante:</strong> <p>{data.usuario_id}</p></div>
        <div><strong>Area:</strong> <p>{data.area_solicitante}</p></div>
        <div><strong>Prioridad:</strong> <p>{data.prioridades?.nombre}</p></div>
      </div>
      <div className="desc-section">
        <h4>Descripción</h4>
        <div className="text-box">{data.descripcion}</div>
      </div>
      {data.comentario_compras && (
        <div className="desc-section">
          <h4>Comentario Compras</h4>
          <div className="text-box action-box">{data.comentario_compras}</div>
        </div>
      )}
    </>
  )
}
