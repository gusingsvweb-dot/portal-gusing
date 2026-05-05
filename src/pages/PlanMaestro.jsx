import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, st } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./Mantenimiento.css";
import "./PlanMaestro.css";

export default function PlanMaestro() {
  const navigate = useNavigate();
  const [planes, setPlanes] = useState([]);
  const [activos, setActivos] = useState([]);
  const [cronogramaAnual, setCronogramaAnual] = useState([]);
  const [activeTab, setActiveTab] = useState("auto"); // "auto" | "anual"
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    activo_id: "", frecuencia_dias: 30,
    proxima_fecha: new Date().toISOString().split("T")[0],
    descripcion_tarea: "", activo: true
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: pls }, { data: acts }, { data: crono }] = await Promise.all([
        supabase.from(st("planes_preventivos")).select(`*, activos(id, nombre, codigo, criticidad, area_id)`).order("proxima_fecha"),
        supabase.from(st("activos")).select("id, nombre, criticidad").order("nombre"),
        supabase.from(st("maintenance_schedules")).select(`*, maintenance_schedule_months:${st("maintenance_schedule_months")}(*)`).eq("year", selectedYear).order("equipment_code")
      ]);
      setPlanes(pls || []);
      setActivos(acts || []);
      setCronogramaAnual(crono || []);
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedYear]);

  const hoy = new Date().toISOString().split("T")[0];

  const stats = useMemo(() => {
    const vencidos = planes.filter(p => p.proxima_fecha <= hoy && p.activo !== false);
    const proximos7 = planes.filter(p => {
      const diff = (new Date(p.proxima_fecha) - new Date()) / (1000 * 60 * 60 * 24);
      return diff > 0 && diff <= 7 && p.activo !== false;
    });
    const activos = planes.filter(p => p.activo !== false);
    return { vencidos: vencidos.length, proximos7: proximos7.length, total: planes.length, activos: activos.length };
  }, [planes, hoy]);

  async function savePlan() {
    if (!form.activo_id || !form.proxima_fecha) return alert("Activo y Fecha son obligatorios");
    setSaving(true);
    const { error } = await supabase.from(st("planes_preventivos")).upsert([form]);
    if (error) alert("Error: " + error.message);
    else { setShowModal(false); resetForm(); loadData(); }
    setSaving(false);
  }

  async function deletePlan(id) {
    if (!confirm("¿Eliminar este plan preventivo?")) return;
    await supabase.from(st("planes_preventivos")).delete().eq("id", id);
    loadData();
  }

  async function generateOrders() {
    setGenerating(true);
    const pendientes = planes.filter(p => p.proxima_fecha <= hoy && p.activo !== false);
    if (pendientes.length === 0) {
      alert("No hay mantenimientos vencidos por generar hoy.");
      setGenerating(false);
      return;
    }
    let creadas = 0;
    for (const plan of pendientes) {
      const newRequest = {
        tipo_solicitud_id: 2,
        area_id: 1,
        prioridad_id: plan.activos?.criticidad === "Alta" ? 3 : plan.activos?.criticidad === "Media" ? 2 : 1,
        estado_id: 1,
        descripcion: `[PLAN PREVENTIVO] ${plan.activos?.nombre} — ${plan.descripcion_tarea || "Revisión programada"}`,
        activo_id: plan.activo_id,
        usuario_id: "SISTEMA",
      };
      const { error: errSol } = await supabase.from(st("solicitudes")).insert([newRequest]);
      if (!errSol) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + plan.frecuencia_dias);
        await supabase.from(st("planes_preventivos")).update({
          ultima_fecha: plan.proxima_fecha,
          proxima_fecha: nextDate.toISOString().split("T")[0],
        }).eq("id", plan.id);
        creadas++;
      }
    }
    alert(`✅ Se generaron ${creadas} órdenes de trabajo preventivo en el Kanban.`);
    loadData();
    setGenerating(false);
  }

  function openEdit(plan) {
    setForm({ ...plan });
    setShowModal(true);
  }

  function resetForm() {
    setForm({ activo_id: "", frecuencia_dias: 30, proxima_fecha: new Date().toISOString().split("T")[0], descripcion_tarea: "", activo: true });
  }

  const diasRestantes = (fecha) => {
    const diff = Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <>
      <Navbar />
      <div className="mant-container">
        <header className="mant-header-section">
          <div>
            <h2 className="mant-title">Plan Maestro de Preventivos</h2>
            <p className="mant-subtitle">Cronograma automático de intervenciones recurrentes GMP</p>
          </div>
          <div className="mant-actions-group">
            <button className="mant-btn-action secondary" onClick={() => navigate("/mantenimiento")}>← Tablero</button>
            <button className="mant-btn-action secondary" onClick={() => navigate("/mantenimiento/importar-cronograma")}>📥 Importar Excel</button>
            <button className="mant-btn-action success" onClick={generateOrders} disabled={generating || stats.vencidos === 0}>
              {generating ? "Generando..." : `🚀 Procesar ${stats.vencidos} Pendiente${stats.vencidos !== 1 ? "s" : ""}`}
            </button>
            <button className="mant-btn-action primary" onClick={() => { resetForm(); setShowModal(true); }}>+ Programar</button>
          </div>
        </header>

        {/* TABS SELECTOR */}
        <div className="pm-tabs">
          <button 
            className={`pm-tab ${activeTab === "auto" ? "active" : ""}`} 
            onClick={() => setActiveTab("auto")}
          >
            ⚙️ Motor Automático
          </button>
          <button 
            className={`pm-tab ${activeTab === "anual" ? "active" : ""}`} 
            onClick={() => setActiveTab("anual")}
          >
            📅 Cronograma Anual {selectedYear}
          </button>
        </div>

        {/* STATS */}
        <div className="pm-stats-row">
          <div className="pm-stat-card pm-vencidos">
            <span className="pm-stat-num">{stats.vencidos}</span>
            <span className="pm-stat-lbl">Vencidos</span>
            {stats.vencidos > 0 && <span className="pm-stat-sub">Requieren acción inmediata</span>}
          </div>
          <div className="pm-stat-card pm-proximos">
            <span className="pm-stat-num">{stats.proximos7}</span>
            <span className="pm-stat-lbl">Próximos 7 días</span>
          </div>
          <div className="pm-stat-card pm-activos">
            <span className="pm-stat-num">{stats.activos}</span>
            <span className="pm-stat-lbl">Planes Activos</span>
          </div>
          <div className="pm-stat-card pm-total">
            <span className="pm-stat-num">{stats.total}</span>
            <span className="pm-stat-lbl">Total Programas</span>
          </div>
        </div>

        {/* ALERTA VENCIDOS */}
        {stats.vencidos > 0 && (
          <div className="pm-alert-banner">
            <span>⚠️ Hay <strong>{stats.vencidos} plan{stats.vencidos !== 1 ? "es" : ""}</strong> con fecha vencida. Use "Procesar Pendientes" para generar las órdenes de trabajo automáticamente.</span>
          </div>
        )}

        {loading ? (
          <div className="mant-loading-state">Cargando datos...</div>
        ) : activeTab === "auto" ? (
          <>
            {/* STATS (only for auto) */}
            <div className="pm-stats-row">
              <div className="pm-stat-card pm-vencidos">
                <span className="pm-stat-num">{stats.vencidos}</span>
                <span className="pm-stat-lbl">Vencidos</span>
                {stats.vencidos > 0 && <span className="pm-stat-sub">Requieren acción inmediata</span>}
              </div>
              <div className="pm-stat-card pm-proximos">
                <span className="pm-stat-num">{stats.proximos7}</span>
                <span className="pm-stat-lbl">Próximos 7 días</span>
              </div>
              <div className="pm-stat-card pm-activos">
                <span className="pm-stat-num">{stats.activos}</span>
                <span className="pm-stat-lbl">Planes Activos</span>
              </div>
              <div className="pm-stat-card pm-total">
                <span className="pm-stat-num">{stats.total}</span>
                <span className="pm-stat-lbl">Total Programas</span>
              </div>
            </div>

            {/* ALERTA VENCIDOS */}
            {stats.vencidos > 0 && (
              <div className="pm-alert-banner">
                <span>⚠️ Hay <strong>{stats.vencidos} plan{stats.vencidos !== 1 ? "es" : ""}</strong> con fecha vencida. Use "Procesar Pendientes" para generar las órdenes de trabajo automáticamente.</span>
              </div>
            )}

            {planes.length === 0 ? (
              <div className="empty-state" style={{ marginTop: "40px" }}>
                <div className="empty-state-icon">📅</div>
                <p>No hay planes preventivos programados</p>
              </div>
            ) : (
              <div className="pm-grid">
                {planes.map(p => {
                  const dias = diasRestantes(p.proxima_fecha);
                  const isVencido = dias <= 0;
                  const isProximo = dias > 0 && dias <= 7;
                  return (
                    <div key={p.id} className={`pm-card ${isVencido ? "pm-card-vencido" : isProximo ? "pm-card-proximo" : ""}`}>
                      {isVencido && <div className="pm-vencido-stripe"></div>}
                      <div className="pm-card-header">
                        <span className="pm-freq-badge">CADA {p.frecuencia_dias} DÍAS</span>
                        <span className={`v2-crit-badge crit-${p.activos?.criticidad?.toLowerCase() || "baja"}`}>
                          {p.activos?.criticidad || "Baja"}
                        </span>
                      </div>
                      <h4 className="pm-card-title">{p.activos?.nombre || "Activo eliminado"}</h4>
                      <p className="pm-card-desc">{p.descripcion_tarea || "Sin descripción"}</p>
                      <div className="pm-dates-box">
                        <div className="pm-date-row">
                          <span className="pm-date-lbl">Última ejecución</span>
                          <span className="pm-date-val">{p.ultima_fecha || "—"}</span>
                        </div>
                        <div className="pm-date-row pm-next-row">
                          <span className="pm-date-lbl">Próxima fecha</span>
                          <span className={`pm-date-val ${isVencido ? "pm-date-vencida" : isProximo ? "pm-date-proximo" : "pm-date-ok"}`}>
                            {p.proxima_fecha}
                          </span>
                        </div>
                      </div>
                      <div className={`pm-dias-chip ${isVencido ? "chip-vencido" : isProximo ? "chip-proximo" : "chip-ok"}`}>
                        {isVencido ? `⚠️ Vencido hace ${Math.abs(dias)} día${dias !== -1 ? "s" : ""}` :
                          `⏳ En ${dias} día${dias !== 1 ? "s" : ""}`}
                      </div>
                      <div className="pm-card-footer">
                        <button className="mini-btn" onClick={() => openEdit(p)}>✏️ Editar</button>
                        <button className="mini-btn" style={{ color: "#ef4444", borderColor: "#fecaca" }} onClick={() => deletePlan(p.id)}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* TAB CRONOGRAMA ANUAL */
          <div className="anual-container">
            <div className="anual-filters">
              <label>Año:</label>
              <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="v2-select" style={{ width: "100px" }}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {cronogramaAnual.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <p>No hay cronograma importado para el año {selectedYear}</p>
                <button className="mant-btn-action secondary" onClick={() => navigate("/mantenimiento/importar-cronograma")}>
                  📥 Importar Cronograma Excel
                </button>
              </div>
            ) : (
              <div className="anual-table-wrapper">
                <table className="anual-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Equipo</th>
                      <th>Tarea</th>
                      {["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"].map(m => (
                        <th key={m} className="month-col">{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cronogramaAnual.map(item => (
                      <tr key={item.id}>
                        <td className="codigo-cell">{item.equipment_code}</td>
                        <td className="nombre-cell">{item.equipment_name}</td>
                        <td className="tarea-cell" title={item.task_description}>{item.task_description || "—"}</td>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => {
                          const scheduled = item.maintenance_schedule_months?.find(mon => mon.month_number === m);
                          return (
                            <td key={m} className="month-col">
                              {scheduled && (
                                <div className={`scheduled-badge ${scheduled.status.toLowerCase()}`} title={scheduled.status}>
                                  X
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* MODAL */}
        {showModal && (
          <div className="mant-modal-overlay-v2" onClick={() => { setShowModal(false); resetForm(); }}>
            <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <h3>{form.id ? "✏️ Editar Programa" : "📅 Nuevo Programa Preventivo"}</h3>
                <button className="close-btn-v2" onClick={() => { setShowModal(false); resetForm(); }}>✖</button>
              </div>
              <div className="modal-v2-body">
                <div className="v2-form-group">
                  <label>Activo a Programar <span className="req">*</span></label>
                  <select className="v2-select" value={form.activo_id} onChange={e => setForm({ ...form, activo_id: e.target.value })}>
                    <option value="">Seleccione activo...</option>
                    {activos.map(a => (
                      <option key={a.id} value={a.id}>{a.nombre} — {a.criticidad}</option>
                    ))}
                  </select>
                </div>
                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Frecuencia (Días)</label>
                    <input type="number" className="v2-input" min="1" value={form.frecuencia_dias}
                      onChange={e => setForm({ ...form, frecuencia_dias: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div className="v2-form-group">
                    <label>Primera / Próxima Fecha <span className="req">*</span></label>
                    <input type="date" className="v2-input" value={form.proxima_fecha}
                      onChange={e => setForm({ ...form, proxima_fecha: e.target.value })} />
                  </div>
                </div>
                <div className="v2-form-group">
                  <label>Descripción de Tareas Preventivas</label>
                  <textarea className="v2-input" rows={4} value={form.descripcion_tarea}
                    onChange={e => setForm({ ...form, descripcion_tarea: e.target.value })}
                    placeholder="Ej: Cambio de lubricante, limpieza de filtros HEPA, ajuste de correas, calibración de sensores..." />
                </div>
                <div className="v2-form-group">
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input type="checkbox" checked={form.activo !== false} onChange={e => setForm({ ...form, activo: e.target.checked })} />
                    Plan activo (incluir en generación automática)
                  </label>
                </div>
              </div>
              <div className="modal-v2-footer">
                <button className="v2-btn-secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancelar</button>
                <button className="v2-btn-primary" onClick={savePlan} disabled={saving}>
                  {saving ? "Guardando..." : form.id ? "Actualizar" : "Guardar Programa"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
