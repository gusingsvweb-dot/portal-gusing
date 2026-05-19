import React, { useEffect, useState, useMemo, useRef } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase, st, ss } from "../api/supabaseClient";
import { useAuth } from "../context/AuthContext";
import "./MisSolicitudes.css";

export default function MisSolicitudes() {
  const { usuarioActual } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState("Todas");
  const [filtro, setFiltro] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [soloCalificar, setSoloCalificar] = useState(false);

  const [puntos, setPuntos] = useState(0);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState("");

  // ============================
  // Cargar solicitudes del usuario
  // ============================
  async function loadSolicitudes() {
    if (!usuarioActual?.usuario) return;

    try {
      // 1. Cargar datos base y catálogos en paralelo (sin joins)
      const [
        { data: solRaw, error: solErr },
        { data: tiposRaw },
        { data: prioRaw },
        { data: estRaw },
        { data: arsRaw }
      ] = await Promise.all([
        supabase.from(st("solicitudes")).select("*").eq("usuario_id", usuarioActual.usuario).order("id", { ascending: false }),
        supabase.from(st("tipos_solicitud")).select("*"),
        supabase.from(st("prioridades")).select("*"),
        supabase.from(st("estados")).select("*"),
        supabase.from(st("areas")).select("*")
      ]);

      if (solErr) throw solErr;

      // 2. Hidratar manualmente
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
      console.error("Error cargando solicitudes:", err);
    }
  }

  useEffect(() => {
    loadSolicitudes();
  }, [usuarioActual]);

  // ============================
  // Tabs Estáticas
  // ============================
  const tabs = ["Todas", "Mantenimiento", "Compras", "Microbiología", "Control Calidad"];

  // ============================
  // Filtrar
  // ============================
  const filtradas = useMemo(() => {
    return solicitudes.filter((s) => {
      // 1. Filtro por Tab (Area)
      if (activeTab !== "Todas") {
        const areaDB = (s.areas?.nombre || "").toLowerCase();
        const tab = activeTab.toLowerCase();

        // Mapeo flexible para evitar problemas de tildes o nombres compuestos
        if (tab.includes("mantenimiento") && !areaDB.includes("mantenimiento")) return false;
        if (tab.includes("compras") && !areaDB.includes("compras")) return false;
        if (tab.includes("micro") && !areaDB.includes("micro")) return false;
        if (tab.includes("calidad") && !areaDB.includes("calidad")) return false;
      }

      // 2. Filtro por Estado y Pendiente Calificar
      if (soloCalificar && s.estado_id !== 14) return false;
      if (!soloCalificar && filtroEstado !== "Todos") {
        if (filtroEstado === "Pendientes" && s.estado_id !== 1) return false;
        if (filtroEstado === "En Proceso" && s.estado_id !== 13) return false;
        if (filtroEstado === "Finalizadas" && s.estado_id !== 14) return false;
        if (filtroEstado === "Cerradas" && s.estado_id !== 15) return false;
      }

      // 3. Filtro de Texto
      if (!filtro) return true;
      const buscar =
        `${s.tipos_solicitud?.nombre ?? ""} ${s.descripcion ?? ""} ${s.areas?.nombre ?? ""
          } ${formatConsecutivo(s)}`.toLowerCase();

      return buscar.includes(filtro.toLowerCase());
    });
  }, [solicitudes, activeTab, filtro, filtroEstado, soloCalificar]);

  // ============================
  // Helper de Clases y Formato
  // ============================
  function getAreaClass(nombreArea) {
    if (!nombreArea) return "";
    const n = nombreArea.toLowerCase();
    if (n.includes("compras")) return "area-compras";
    if (n.includes("mantenimiento")) return "area-mantenimiento";
    if (n.includes("micro")) return "area-micro";
    if (n.includes("calidad")) return "area-calidad";
    return "";
  }

  function formatConsecutivo(s) {
    if (!s.consecutivo) return `#${s.id}`;
    // Lógica personalizada por área si se desea, o genérica
    if (s.area_id === 1) return `M-${s.consecutivo}`; // Mantenimiento
    if (s.area_id === 4) return `C-${s.consecutivo}`; // Compras
    // Calidad, Micro, etc si tienen prefijos definidos
    if (s.area_id === 15) return `MB-${s.consecutivo}`; // Ejemplo Micro
    return `${s.consecutivo}`;
  }

  // ============================
  // Enviar calificación
  // ============================
  async function enviarCalificacion() {
    if (!selected) return;

    if (puntos === 0) {
      setError("Por favor, selecciona una calificación (estrellas).");
      return;
    }

    const { error } = await supabase
      .from(st("solicitudes"))
      .update({
        estado_id: 15, // Calificado
        calificacion: puntos.toString(),
        comentario,
      })
      .eq("id", selected.id);

    if (error) {
      alert("Error enviando calificación: " + error.message);
      return;
    }

    setPuntos(0);
    setComentario("");
    setSelected(null);
    loadSolicitudes();
  }

  const tabsRef = useRef(null);

  const scrollTabs = (direction) => {
    if (tabsRef.current) {
      tabsRef.current.scrollBy({ left: direction === 'left' ? -150 : 150, behavior: 'smooth' });
    }
  };

  return (
    <>
      <Navbar />

      <div className="ms-wrapper">

        {/* LISTA IZQUIERDA */}
        <div className="ms-list">
          <div className="ms-header">
            <h2>📄 Mis Solicitudes</h2>
            <div className="ms-filter-container">
              <input
                className="ms-filter"
                type="text"
                placeholder="🔍 Buscar solicitud..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                style={{ marginBottom: "12px" }}
              />
              <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                <select 
                  className="ms-filter" 
                  style={{ flex: 1, padding: "8px 12px" }} 
                  value={filtroEstado} 
                  onChange={e => setFiltroEstado(e.target.value)}
                  disabled={soloCalificar}
                >
                  <option value="Todos">Todos los Estados</option>
                  <option value="Pendientes">Pendientes</option>
                  <option value="En Proceso">En Proceso</option>
                  <option value="Finalizadas">Finalizadas</option>
                  <option value="Cerradas">Cerradas</option>
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "#64748b", cursor: "pointer", fontWeight: "600" }}>
                <input 
                  type="checkbox" 
                  checked={soloCalificar} 
                  onChange={e => {
                    setSoloCalificar(e.target.checked);
                    if (e.target.checked) setFiltroEstado("Todos");
                  }} 
                />
                ⭐ Pendientes por Calificar
              </label>
            </div>
          </div>

          {/* TABS CON FLECHAS */}
          <div className="ms-tabs-wrapper">
            <button className="ms-tab-arrow" onClick={() => scrollTabs('left')}>&lt;</button>
            <div className="ms-tabs" ref={tabsRef}>
              {tabs.map(tab => (
                <button
                  key={tab}
                  className={`ms-tab ${activeTab === tab ? "active" : ""}`}
                  onClick={() => { setActiveTab(tab); setSelected(null); }}
                >
                  {tab}
                </button>
              ))}
            </div>
            <button className="ms-tab-arrow" onClick={() => scrollTabs('right')}>&gt;</button>
          </div>


          {/* ITEMS LIST */}
          <div className="ms-items-container">
            {filtradas.map((s) => (
              <div
                key={s.id}
                className={`ms-item ${selected?.id === s.id ? "ms-selected" : ""} ${getAreaClass(s.areas?.nombre)}`}
                onClick={() => setSelected(s)}
              >
                <div className="ms-item-top">
                  <span className="ms-consecutivo">{formatConsecutivo(s)}</span>
                  <span className={`ms-status-badge status-${s.estado_id}`}>
                    {s.estados?.nombre}
                  </span>
                </div>

                <h4>{s.tipos_solicitud?.nombre?.replace("_antiguo", "").trim()}</h4>

                <div className="ms-item-footer">
                  <div className="ms-area-label">
                    <span className="ms-area-dot"></span>
                    {s.areas?.nombre || "General"}
                  </div>
                  <span className="ms-date">{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}

            {filtradas.length === 0 && (
              <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                <p>
                  {activeTab === "Todas"
                    ? "No se encontraron solicitudes."
                    : `No hay solicitudes para el área de ${activeTab}.`}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* DETALLE DERECHA */}
        <div className="ms-detail">
          {selected ? (
            <div className="ms-card-main">
              <div className="ms-detail-header">
                <div className="ms-detail-title">
                  <h1>{selected.tipos_solicitud?.nombre?.replace("_antiguo", "").trim()}</h1>
                  <div className="ms-detail-meta">
                    Solicitado el {new Date(selected.created_at).toLocaleString()}
                  </div>
                </div>
                <div className={`ms-big-status status-${selected.estado_id}`}>
                  {selected.estados?.nombre}
                </div>
              </div>

              <div className="ms-info-grid">
                <div className="ms-info-item">
                  <label>Identificador</label>
                  <p>{formatConsecutivo(selected)}</p>
                </div>
                <div className="ms-info-item">
                  <label>Área Destino</label>
                  <p>{selected.areas?.nombre}</p>
                </div>
                <div className="ms-info-item">
                  <label>Prioridad</label>
                  <p>{selected.prioridades?.nombre}</p>
                </div>
                <div className="ms-info-item">
                  <label>Área Solicitante</label>
                  <p>{selected.area_solicitante}</p>
                </div>
              </div>

              <div className="ms-section">
                <h3>📝 Descripción</h3>
                <div className="ms-content-box">{selected.descripcion}</div>
              </div>

              {selected.justificacion && (
                <div className="ms-section">
                  <h3>📌 Justificación</h3>
                  <div className="ms-content-box">{selected.justificacion}</div>
                </div>
              )}

              {selected.accion_realizada && (
                <div className="ms-section">
                  <h3>✅ Acción Realizada</h3>
                  <div className="ms-content-box highlight">{selected.accion_realizada}</div>
                </div>
              )}

              {/* CALIFICACIÓN */}
              {selected.estado_id === 14 && (
                <div className="ms-rating-box">
                  <div className="ms-rating-title">⭐ Calificar Servicio</div>
                  <p>Ayúdanos a mejorar calificando la atención de esta solicitud:</p>

                  <div className="ms-stars-row" style={{ display: "flex", gap: "10px", margin: "15px 0", fontSize: "2rem", cursor: "pointer" }}>
                    {[1, 2, 3, 4, 5].map((num) => (
                      <span 
                        key={num} 
                        style={{ color: num <= puntos ? "#f59e0b" : "#e2e8f0", transition: "all 0.2s" }}
                        onClick={() => setPuntos(num)}
                      >
                        ★
                      </span>
                    ))}
                  </div>

                  <div className="ms-input-area">
                    <textarea
                      className="ms-filter"
                      rows="3"
                      value={comentario}
                      placeholder="Comentario adicional (opcional)..."
                      onChange={(e) => setComentario(e.target.value)}
                      style={{ background: '#fff', border: '1px solid #e2e8f0', width: '100%', padding: '10px', borderRadius: '8px' }}
                    />
                    <button 
                      className="ms-submit-btn" 
                      onClick={enviarCalificacion}
                      style={{ marginTop: '10px', background: '#1e40af', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      Enviar Calificación
                    </button>
                    {error && <p style={{ color: '#ef4444', fontWeight: 'bold', marginTop: '10px' }}>{error}</p>}
                  </div>
                </div>
              )}

              {selected.estado_id === 15 && (
                <div style={{ marginTop: '30px', padding: '20px', background: '#ecfdf5', borderRadius: '12px', color: '#047857', textAlign: 'center', fontWeight: '600' }}>
                  ✔ Solicitud Calificada y Cerrada. Gracias por tu feedback.
                </div>
              )}

            </div>
          ) : (
            <div className="ms-empty-state">
              <div className="ms-empty-icon">👈</div>
              <h3>Selecciona una solicitud</h3>
              <p>Verás los detalles completos en este panel.</p>
            </div>
          )}
        </div>

      </div>

      <Footer />
    </>
  );
}
