import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, st, ss } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./Mantenimiento.css";

export default function PlanMaestro() {
  const navigate = useNavigate();
  const [planes, setPlanes] = useState([]);
  const [activos, setActivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState({
    activo_id: "",
    frecuencia_dias: 30,
    proxima_fecha: new Date().toISOString().split("T")[0],
    descripcion_tarea: ""
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data: pls } = await supabase
      .from(st("planes_preventivos"))
      .select(`
        *,
        activos ( id, nombre, codigo, criticidad )
      `)
      .order("proxima_fecha");
    
    const { data: acts } = await supabase.from(st("activos")).select("id, nombre").order("nombre");
    
    setPlanes(pls || []);
    setActivos(acts || []);
    setLoading(false);
  }

  async function savePlan() {
    if (!form.activo_id || !form.proxima_fecha) return alert("Activo y Fecha son obligatorios");
    
    const { error } = await supabase.from(st("planes_preventivos")).upsert([form]);
    if (error) alert("Error: " + error.message);
    else {
      setShowModal(false);
      setForm({
        activo_id: "",
        frecuencia_dias: 30,
        proxima_fecha: new Date().toISOString().split("T")[0],
        descripcion_tarea: ""
      });
      loadData();
    }
  }

  /**
   * Genera órdenes de trabajo para los planes cuya fecha sea hoy o anterior
   */
  async function generateOrders() {
    setGenerating(true);
    const hoy = new Date().toISOString().split("T")[0];
    const pendientes = planes.filter(p => p.proxima_fecha <= hoy && p.activo);

    if (pendientes.length === 0) {
      alert("No hay mantenimientos pendientes por generar hoy.");
      setGenerating(false);
      return;
    }

    let creadas = 0;
    for (const plan of pendientes) {
      // 1. Crear Solicitud en la tabla solicitudes
      const newRequest = {
        tipo_solicitud_id: 2, // Mantenimiento (Id asumido del maestro)
        area_id: 1, // Area Mantenimiento
        prioridad_id: plan.activos?.criticidad === "Alta" ? 3 : 2,
        estado_id: 1, // Pendiente
        descripcion: `[PLAN PREVENTIVO] - ${plan.descripcion_tarea || "Revisión programada"}`,
        activo_id: plan.activo_id,
        usuario_id: "SISTEMA"
      };

      const { data: sol, error: errSol } = await supabase.from(st("solicitudes")).insert([newRequest]).select();

      if (!errSol) {
        // 2. Actualizar el Plan con la siguiente fecha y marcar la anterior como última
        const nextDate = new Date();
        nextDate.setDate(new Date().getDate() + plan.frecuencia_dias);
        
        await supabase
          .from(st("planes_preventivos"))
          .update({
            ultima_fecha: plan.proxima_fecha,
            proxima_fecha: nextDate.toISOString().split("T")[0]
          })
          .eq("id", plan.id);
        
        creadas++;
      }
    }

    alert(`Se generaron ${creadas} órdenes de trabajo preventivo.`);
    loadData();
    setGenerating(false);
  }

  return (
    <>
      <Navbar />
      <div className="mant-container">
        <header className="mant-header-section">
          <div>
            <h2 className="mant-title">📅 Plan Maestro de Preventivos</h2>
            <p className="mant-subtitle">Cronograma automático de intervenciones recurrentes</p>
          </div>
          <div className="mant-actions-group" style={{ display: "flex", gap: "12px" }}>
            <button className="mant-btn secondary" onClick={() => navigate("/mantenimiento")}>
              ← Volver
            </button>
            <button 
              className="mant-btn" 
              style={{ background: "#10b981", color: "white" }} 
              onClick={generateOrders}
              disabled={generating}
            >
              {generating ? "Generando..." : "🚀 Procesar Pendientes"}
            </button>
            <button className="mant-btn primary" onClick={() => setShowModal(true)}>
              + Programar Nuevo
            </button>
          </div>
        </header>

        {loading ? (
          <div className="mant-loading-state">Cargando cronograma...</div>
        ) : (
          <div className="pm-grid" style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", 
            gap: "20px",
            marginTop: "30px" 
          }}>
            {planes.map(p => (
              <div key={p.id} className={`pm-card ${new Date(p.proxima_fecha) <= new Date() ? 'vencido' : ''}`} style={{
                background: "white",
                padding: "20px",
                borderRadius: "20px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                position: "relative",
                overflow: "hidden"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "15px" }}>
                   <span style={{ 
                     background: "#f1f5f9", 
                     color: "#64748b", 
                     fontSize: "0.7rem", 
                     padding: "4px 8px", 
                     borderRadius: "6px",
                     fontWeight: "700"
                   }}>FREQ: {p.frecuencia_dias} DÍAS</span>
                   <span className={`v2-crit-badge crit-${p.activos?.criticidad?.toLowerCase() || 'baja'}`}>
                      {p.activos?.criticidad || 'Baja'}
                   </span>
                </div>
                
                <h4 style={{ margin: "0 0 5px 0", color: "#1e293b" }}>{p.activos?.nombre}</h4>
                <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "20px" }}>{p.descripcion_tarea}</p>
                
                <div style={{ 
                  background: "#f8fafc", 
                  padding: "12px", 
                  borderRadius: "12px",
                  border: "1px solid #f1f5f9"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "5px" }}>
                    <span style={{ color: "#94a3b8" }}>Último:</span>
                    <span style={{ fontWeight: "600" }}>{p.ultima_fecha || "---"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span style={{ color: "#475569", fontWeight: "700" }}>Próximo:</span>
                    <span style={{ 
                      color: new Date(p.proxima_fecha) <= new Date() ? "#ef4444" : "#2563eb",
                      fontWeight: "800"
                    }}>{p.proxima_fecha}</span>
                  </div>
                </div>
                
                {new Date(p.proxima_fecha) <= new Date() && (
                  <div style={{ 
                    position: "absolute", 
                    top: "0", 
                    left: "0", 
                    width: "4px", 
                    height: "100%", 
                    background: "#ef4444" 
                  }}></div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Modal Programación */}
        {showModal && (
          <div className="mant-modal-overlay-v2" onClick={() => setShowModal(false)}>
            <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <h3>📅 Programar Mantenimiento</h3>
                <button className="close-btn-v2" onClick={() => setShowModal(false)}>✖</button>
              </div>
              <div className="modal-v2-body">
                <div className="v2-form-group">
                  <label>Activo a Programar</label>
                  <select 
                    className="v2-select" 
                    value={form.activo_id} 
                    onChange={e => setForm({...form, activo_id: e.target.value})}
                  >
                    <option value="">Seleccione activo...</option>
                    {activos.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
                <div className="v2-form-row">
                   <div className="v2-form-group">
                      <label>Frecuencia (Días)</label>
                      <input 
                        type="number" 
                        className="v2-input" 
                        value={form.frecuencia_dias}
                        onChange={e => setForm({...form, frecuencia_dias: parseInt(e.target.value)})}
                      />
                   </div>
                   <div className="v2-form-group">
                      <label>Primera Fecha</label>
                      <input 
                        type="date" 
                        className="v2-input" 
                        value={form.proxima_fecha}
                        onChange={e => setForm({...form, proxima_fecha: e.target.value})}
                      />
                   </div>
                </div>
                <div className="v2-form-group">
                   <label>Descripción de Tareas Preventivas</label>
                   <textarea 
                     className="v2-input" 
                     rows="3"
                     value={form.descripcion_tarea}
                     onChange={e => setForm({...form, descripcion_tarea: e.target.value})}
                     placeholder="Ej: Cambio de lubricante, limpieza de filtros y ajuste de pernos..."
                   />
                </div>
              </div>
              <div className="modal-v2-footer">
                <button className="v2-btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="v2-btn-primary" onClick={savePlan}>Guardar Programa</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
