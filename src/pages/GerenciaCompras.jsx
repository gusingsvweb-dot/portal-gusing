// src/pages/GerenciaCompras.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase, st, ss } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom"; // Importar hook
import OrdenCompraPDF from "../components/compras/OrdenCompraPDF";
import "./GerenciaCompras.css";

export default function GerenciaCompras() {
  const { usuarioActual } = useAuth();
  const navigate = useNavigate(); // Hook de navegación

  const [solicitudes, setSolicitudes] = useState([]);
  const [selected, setSelected] = useState(null);

  const [comentarioGerencia, setComentarioGerencia] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [showPDF, setShowPDF] = useState(false);
  const [error, setError] = useState("");

  // =============================
  // CARGAR SOLICITUDES (18, 23, 24, 19, 14)
  // =============================
  async function loadSolicitudes() {
    setError("");

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
            )
          `))
          .in("estado_id", [14, 18, 19, 23, 24])
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
      console.error("Error cargando compras en gerencia:", err);
      setSolicitudes([]);
    }
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
      .from(st("aprobaciones"))
      .select(ss("id"))
      .eq("solicitud_id", solicitudId)
      .maybeSingle();

    if (errFind) throw errFind;

    // 2. Insertar o Actualizar manualmente
    if (existing) {
      const { error } = await supabase
        .from(st("aprobaciones"))
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from(st("aprobaciones"))
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
        .from(st("solicitudes"))
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

      await supabase.from(st("solicitudes")).update({ estado_id: 17 }).eq("id", selected.id);
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

              {/* Boton para PDF en estado 24 (Aprobación OC) o 19 (Pagando) o 14 (Finalizado) */}
              {[24, 19, 14].includes(selected.estado_id) && (
                <div style={{ marginTop: '15px' }}>
                  <button className="gcg-btn-kpi" onClick={() => setShowPDF(true)} style={{ backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                    📄 Ver PDF Orden de Compra
                  </button>
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
    <div className="gcg-card" onClick={onClick}>
      <div className="card-top">
        <span className="card-id">{data.consecutivo ? `C-${data.consecutivo}` : `#${data.id}`}</span>
        {data.prioridades?.nombre && <span className="card-priority">{data.prioridades?.nombre}</span>}
      </div>
      <h4 className="card-title">{data.tipos_solicitud?.nombre}</h4>
      <p className="card-area">{data.estados?.nombre}</p>
    </div>
  )
}

function InfoGrid({ data }) {
  const detalle = data.compras_solicitudes_detalle?.[0];
  const items = data.compras_solicitud_items || [];
  const cotizaciones = data.compras_cotizaciones || [];

  const [adjuntos, setAdjuntos] = React.useState([]);

  React.useEffect(() => {
    async function loadAdjuntos() {
      if (data?.id) {
        const { data: adjData } = await supabase
          .from("compras_adjuntos")
          .select("*")
          .eq("solicitud_id", data.id)
          .eq("tipo", "COTIZACION_PREVIA");
        if (adjData) setAdjuntos(adjData);
      }
    }
    loadAdjuntos();
  }, [data?.id]);

  return (
    <>
      <div className="info-grid">
        <div><strong>Solicitante:</strong> <p>{data.usuario_id}</p></div>
        <div><strong>Area:</strong> <p>{data.area_solicitante}</p></div>
        {data.prioridades?.nombre && <div><strong>Prioridad:</strong> <p>{data.prioridades?.nombre}</p></div>}
      </div>

      {detalle && (
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

      {items.length > 0 && (
        <div className="items-section" style={{ marginTop: '15px' }}>
          <h4>Ítems Solicitados</h4>
          <div style={{ overflowX: 'auto', marginTop: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                  <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1', width: '50px' }}>Item</th>
                  <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1' }}>Descripción</th>
                  <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1', width: '80px', textAlign: 'center' }}>Cant.</th>
                </tr>
              </thead>
              <tbody>
                {items.sort((a,b) => a.orden - b.orden).map((it, idx) => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px' }}>{it.orden}</td>
                    <td style={{ padding: '8px' }}>{it.descripcion}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}><strong>{it.cantidad_solicitada}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {adjuntos.length > 0 && (
        <div className="desc-section" style={{ marginTop: '15px' }}>
          <h4>Soportes Subidos (Cotizaciones Cliente)</h4>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: '5px' }}>
            {adjuntos.map(adj => (
              <a
                key={adj.id}
                href={adj.path}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block", padding: "6px 12px", background: "#e2e8f0",
                  color: "#1e293b", borderRadius: "6px", textDecoration: "none", fontSize: "0.85rem", fontWeight: "bold"
                }}
              >
                📄 Ver Soporte
              </a>
            ))}
          </div>
        </div>
      )}

      {cotizaciones.length > 0 && (
        <div className="cots-section" style={{ marginTop: '15px' }}>
          <h4>Cotizaciones Recibidas</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
            {cotizaciones.map((cot, idx) => {
              const isSelected = detalle?.cotizacion_seleccionada_id === cot.id || (idx === 0 && !detalle?.cotizacion_seleccionada_id);
              return (
              <div key={cot.id} style={{ border: isSelected ? '2px solid #10b981' : '1px solid #cbd5e1', padding: '10px', borderRadius: '6px', background: isSelected ? '#ecfdf5' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <strong>Proveedor: {cot.compras_proveedores?.razon_social} ({cot.compras_proveedores?.nit})</strong>
                  {isSelected && <span style={{ background: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>Recomendada</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '0.85rem' }}>
                  <div><strong>Valor Total:</strong> ${Number(cot.total).toLocaleString()}</div>
                  <div><strong>Fecha Est.:</strong> {cot.fecha_compromiso_entrega || 'N/A'}</div>
                  <div style={{ gridColumn: '1 / -1' }}><strong>Condiciones:</strong> {cot.condiciones_pago || 'N/A'}</div>
                  {cot.observaciones && <div style={{ gridColumn: '1 / -1' }}><strong>Obs:</strong> {cot.observaciones}</div>}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {data.comentario_compras && (
        <div className="desc-section" style={{ marginTop: '15px' }}>
          <h4>Comentario Compras</h4>
          <div className="text-box action-box">{data.comentario_compras}</div>
        </div>
      )}
    </>
  )
}
