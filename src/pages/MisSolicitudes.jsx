import React, { useEffect, useState, useMemo, useRef } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase } from "../api/supabaseClient";
import { useAuth } from "../context/AuthContext";
import "./MisSolicitudes.css";

export default function MisSolicitudes() {
  const { usuarioActual } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState("Todas");
  const [filtro, setFiltro] = useState("");

  // Calificación
  const [calificacion, setCalificacion] = useState("");
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState("");

  // ============================
  // Cargar solicitudes del usuario
  // ============================
  async function loadSolicitudes() {
    if (!usuarioActual?.usuario) return;

    const { data, error } = await supabase
      .from("solicitudes")
      .select(`
        *,
        tipos_solicitud ( nombre ),
        prioridades ( nombre ),
        estados ( nombre ),
        areas:area_id ( nombre )
      `)
      .eq("usuario_id", usuarioActual.usuario)
      .order("id", { ascending: false });

    if (!error) {
      setSolicitudes(data || []);
    } else {
      console.error("Error cargando solicitudes:", error);
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

      // 2. Filtro de Texto
      if (!filtro) return true;
      const buscar =
        `${s.tipos_solicitud?.nombre ?? ""} ${s.descripcion ?? ""} ${s.areas?.nombre ?? ""
          } ${formatConsecutivo(s)}`.toLowerCase();

      return buscar.includes(filtro.toLowerCase());
    });
  }, [solicitudes, activeTab, filtro]);

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

    if (!calificacion.trim()) {
      setError("Debes escribir una calificación/comentario.");
      return;
    }

    const { error } = await supabase
      .from("solicitudes")
      .update({
        estado_id: 15, // Calificado
        calificacion,
        comentario,
      })
      .eq("id", selected.id);

    if (error) {
      alert("Error enviando calificación: " + error.message);
      return;
    }

    setCalificacion("");
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
                placeholder="🔍 Buscar..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
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

                <h4>{s.tipos_solicitud?.nombre}</h4>

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
                  <h1>{selected.tipos_solicitud?.nombre}</h1>
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
                  <p>Ayúdanos a mejorar contándonos tu experiencia con esta solicitud.</p>

                  <div className="ms-input-area">
                    <textarea
                      className="ms-filter"
                      rows="3"
                      value={calificacion}
                      placeholder="Escribe tu opinión aquí..."
                      onChange={(e) => setCalificacion(e.target.value)}
                      style={{ background: '#fff' }}
                    />
                    <button className="ms-submit-btn" onClick={enviarCalificacion}>
                      Enviar Calificación
                    </button>
                    {error && <p style={{ color: '#ef4444', fontWeight: 'bold' }}>{error}</p>}
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
