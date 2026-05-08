import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, st } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./Mantenimiento.css";
import "./PlanMaestro.css";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MESES_CORTO = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

export default function PlanMaestro() {
  const navigate = useNavigate();
  const [planes, setPlanes] = useState([]);
  const [activos, setActivos] = useState([]);
  const [cronogramaAnual, setCronogramaAnual] = useState([]);
  const [activeTab, setActiveTab] = useState("auto"); // "auto" | "semanal" | "anual"
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completando, setCompletando] = useState(null); // id del plan siendo completado

  // Filtros Motor Automático
  const [filtroMes, setFiltroMes] = useState("todos"); // "todos" | "0"-"11"
  const [filtroEstadoAuto, setFiltroEstadoAuto] = useState("todos"); // "todos"|"vencido"|"proximo"|"ok"

  // Filtros Cronograma Anual
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroMesAnual, setFiltroMesAnual] = useState("todos"); // "todos" | "1"-"12"

  // Vista Semanal
  const [semanalMes, setSemanalMes] = useState(new Date().getMonth()); // 0-11
  const [semanalAnio, setSemanalAnio] = useState(new Date().getFullYear());

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
        supabase.from(st("planes_preventivos")).select(`*, activos:${st("activos")}(id, nombre, codigo, criticidad, area_id)`).order("proxima_fecha"),
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

  useEffect(() => { loadData(); }, [selectedYear]);

  const hoy = new Date().toISOString().split("T")[0];

  const stats = useMemo(() => {
    const vencidos = planes.filter(p => p.proxima_fecha <= hoy && p.activo !== false);
    const proximos7 = planes.filter(p => {
      const diff = (new Date(p.proxima_fecha) - new Date()) / (1000 * 60 * 60 * 24);
      return diff > 0 && diff <= 7 && p.activo !== false;
    });
    const activosPlanes = planes.filter(p => p.activo !== false);
    return { vencidos: vencidos.length, proximos7: proximos7.length, total: planes.length, activos: activosPlanes.length };
  }, [planes, hoy]);

  // ── Planes filtrados para Motor Automático ──
  const planesFiltrados = useMemo(() => {
    return planes.filter(p => {
      if (filtroMes !== "todos") {
        const mes = new Date(p.proxima_fecha).getMonth();
        if (mes !== parseInt(filtroMes)) return false;
      }
      if (filtroEstadoAuto !== "todos") {
        const dias = diasRestantes(p.proxima_fecha);
        if (filtroEstadoAuto === "vencido" && dias > 0) return false;
        if (filtroEstadoAuto === "proximo" && (dias <= 0 || dias > 7)) return false;
        if (filtroEstadoAuto === "ok" && (dias <= 7)) return false;
      }
      return true;
    });
  }, [planes, filtroMes, filtroEstadoAuto]);

  // ── Planes por semana (Vista Semanal) ──
  const semanasPorMes = useMemo(() => {
    const primerDia = new Date(semanalAnio, semanalMes, 1);
    const ultimoDia = new Date(semanalAnio, semanalMes + 1, 0);
    const semanas = [];

    let inicio = new Date(primerDia);
    let semNum = 1;
    while (inicio <= ultimoDia) {
      const fin = new Date(inicio);
      fin.setDate(fin.getDate() + 6);
      if (fin > ultimoDia) fin.setTime(ultimoDia.getTime());

      const inicioStr = inicio.toISOString().split("T")[0];
      const finStr = fin.toISOString().split("T")[0];

      const tareas = planes.filter(p => {
        if (!p.activo) return false;
        return p.proxima_fecha >= inicioStr && p.proxima_fecha <= finStr;
      });

      semanas.push({ num: semNum, inicio: inicioStr, fin: finStr, tareas });
      semNum++;
      inicio = new Date(fin);
      inicio.setDate(inicio.getDate() + 1);
    }
    return semanas;
  }, [planes, semanalMes, semanalAnio]);

  async function completarPlan(plan) {
    if (!confirm(`¿Marcar como completado el preventivo de "${plan.activos?.nombre}"? Esto avanzará la próxima fecha.`)) return;
    setCompletando(plan.id);
    const hoyDate = new Date().toISOString().split("T")[0];
    const proxima = new Date();
    proxima.setDate(proxima.getDate() + (plan.frecuencia_dias || 30));
    const proximaStr = proxima.toISOString().split("T")[0];
    await supabase.from(st("planes_preventivos")).update({
      ultima_fecha: hoyDate,
      proxima_fecha: proximaStr,
    }).eq("id", plan.id);
    setCompletando(null);
    loadData();
  }

  async function toggleMonthStatus(monthEntry) {
    const newStatus = monthEntry.status === "completado" ? "pendiente" : "completado";
    await supabase.from(st("maintenance_schedule_months")).update({ status: newStatus }).eq("id", monthEntry.id);
    setCronogramaAnual(prev => prev.map(item => ({
      ...item,
      maintenance_schedule_months: item.maintenance_schedule_months?.map(m =>
        m.id === monthEntry.id ? { ...m, status: newStatus } : m
      )
    })));
  }

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

  async function syncWithMotor() {
    if (!cronogramaAnual.length) return;
    if (!confirm("¿Deseas sincronizar los equipos del cronograma con el Motor Automático?")) return;
    setSyncing(true);
    try {
      const { syncAllSchedulesWithMotor } = await import("../api/supabaseMaintenanceSchedule");
      const result = await syncAllSchedulesWithMotor(selectedYear);
      if (result.matched === 0) {
        alert("Atención: No se encontró ningún activo coincidente. Importa primero los activos.");
      } else {
        alert(`¡Sincronización completada!\n\n- Equipos vinculados: ${result.matched}\n- Planes creados/actualizados: ${result.updated}\n- No encontrados: ${result.missing}`);
        setActiveTab("auto");
        loadData();
      }
    } catch (err) {
      alert("Error al sincronizar: " + err.message);
    } finally {
      setSyncing(false);
    }
  }

  function openEdit(plan) { setForm({ ...plan }); setShowModal(true); }
  function resetForm() {
    setForm({ activo_id: "", frecuencia_dias: 30, proxima_fecha: new Date().toISOString().split("T")[0], descripcion_tarea: "", activo: true });
  }

  const diasRestantes = (fecha) => Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24));

  // ── Cronograma Anual filtrado ──
  const cronogramaFiltrado = useMemo(() => {
    return cronogramaAnual.filter(item => {
      const matchText = !filtroTexto || (
        item.equipment_name?.toLowerCase().includes(filtroTexto.toLowerCase()) ||
        item.equipment_code?.toLowerCase().includes(filtroTexto.toLowerCase()) ||
        item.task_description?.toLowerCase().includes(filtroTexto.toLowerCase())
      );
      if (!matchText) return false;

      if (filtroMesAnual !== "todos") {
        const mesNum = parseInt(filtroMesAnual);
        return item.maintenance_schedule_months?.some(m => m.month_number === mesNum);
      }

      if (filtroEstado !== "todos") {
        return item.maintenance_schedule_months?.some(m => m.status.toLowerCase() === filtroEstado.toLowerCase());
      }
      return true;
    });
  }, [cronogramaAnual, filtroTexto, filtroEstado, filtroMesAnual]);

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

        {/* TABS */}
        <div className="pm-tabs">
          <button className={`pm-tab ${activeTab === "auto" ? "active" : ""}`} onClick={() => setActiveTab("auto")}>
            ⚙️ Motor Automático
          </button>
          <button className={`pm-tab ${activeTab === "semanal" ? "active" : ""}`} onClick={() => setActiveTab("semanal")}>
            📆 Vista Semanal
          </button>
          <button className={`pm-tab ${activeTab === "anual" ? "active" : ""}`} onClick={() => setActiveTab("anual")}>
            📅 Cronograma Anual {selectedYear}
          </button>
        </div>

        {loading ? (
          <div className="mant-loading-state">Cargando datos...</div>
        ) : activeTab === "auto" ? (

          /* ══ TAB: MOTOR AUTOMÁTICO ══ */
          <>
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

            {stats.vencidos > 0 && (
              <div className="pm-alert-banner">
                ⚠️ Hay <strong>{stats.vencidos} plan{stats.vencidos !== 1 ? "es" : ""}</strong> vencidos. Use "Procesar Pendientes" para generar órdenes de trabajo automáticamente.
              </div>
            )}

            {/* Filtros Motor Automático */}
            <div className="pm-filter-bar">
              <div className="pm-filter-group">
                <label>Mes:</label>
                <select className="v2-select" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
                  <option value="todos">Todos los meses</option>
                  {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div className="pm-filter-group">
                <label>Estado:</label>
                <select className="v2-select" value={filtroEstadoAuto} onChange={e => setFiltroEstadoAuto(e.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="vencido">⚠️ Vencidos</option>
                  <option value="proximo">⏳ Próximos 7 días</option>
                  <option value="ok">✅ Al día</option>
                </select>
              </div>
              {(filtroMes !== "todos" || filtroEstadoAuto !== "todos") && (
                <span className="pm-filter-count">{planesFiltrados.length} plan{planesFiltrados.length !== 1 ? "es" : ""}</span>
              )}
            </div>

            {planesFiltrados.length === 0 ? (
              <div className="empty-state" style={{ marginTop: "40px" }}>
                <div className="empty-state-icon">📅</div>
                <p>{planes.length === 0 ? "No hay planes preventivos programados" : "No hay planes con estos filtros"}</p>
              </div>
            ) : (
              <div className="pm-grid">
                {planesFiltrados.map(p => {
                  const dias = diasRestantes(p.proxima_fecha);
                  const isVencido = dias <= 0;
                  const isProximo = dias > 0 && dias <= 7;
                  const isCompletandoEste = completando === p.id;
                  return (
                    <div key={p.id} className={`pm-card ${isVencido ? "pm-card-vencido" : isProximo ? "pm-card-proximo" : ""}`}>
                      {isVencido && <div className="pm-vencido-stripe"></div>}
                      <div className="pm-card-header">
                        <span className="pm-freq-badge">CADA {p.frecuencia_dias} DÍAS</span>
                        <span className={`v2-crit-badge crit-${p.activos?.criticidad?.toLowerCase() || "baja"}`}>
                          {p.activos?.criticidad || "Baja"}
                        </span>
                      </div>
                      <h4 className="pm-card-title">{p.activos?.nombre || "Equipo eliminado"}</h4>
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
                        <button
                          className="mini-btn mini-btn-complete"
                          onClick={() => completarPlan(p)}
                          disabled={isCompletandoEste}
                          title="Marcar como completado y avanzar fecha"
                        >
                          {isCompletandoEste ? "..." : "✓ Completar"}
                        </button>
                        <button className="mini-btn" onClick={() => openEdit(p)}>✏️ Editar</button>
                        <button className="mini-btn" style={{ color: "#ef4444", borderColor: "#fecaca" }} onClick={() => deletePlan(p.id)}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>

        ) : activeTab === "semanal" ? (

          /* ══ TAB: VISTA SEMANAL ══ */
          <div className="pm-semanal-container">
            <div className="pm-semanal-header">
              <div className="pm-filter-group">
                <label>Mes:</label>
                <select className="v2-select" value={semanalMes} onChange={e => setSemanalMes(parseInt(e.target.value))}>
                  {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div className="pm-filter-group">
                <label>Año:</label>
                <select className="v2-select" value={semanalAnio} onChange={e => setSemanalAnio(parseInt(e.target.value))}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <span className="pm-semanal-titulo">{MESES[semanalMes]} {semanalAnio}</span>
            </div>

            {semanasPorMes.every(s => s.tareas.length === 0) ? (
              <div className="empty-state" style={{ marginTop: "40px" }}>
                <div className="empty-state-icon">📆</div>
                <p>No hay preventivos programados para {MESES[semanalMes]} {semanalAnio}</p>
              </div>
            ) : (
              <div className="pm-semanas-grid">
                {semanasPorMes.map(semana => (
                  <div key={semana.num} className="pm-semana-col">
                    <div className="pm-semana-header">
                      <span className="pm-semana-num">Semana {semana.num}</span>
                      <span className="pm-semana-rango">
                        {new Date(semana.inicio + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })} —{" "}
                        {new Date(semana.fin + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                      </span>
                      <span className="pm-semana-badge">{semana.tareas.length} tarea{semana.tareas.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="pm-semana-tareas">
                      {semana.tareas.length === 0 ? (
                        <div className="pm-semana-empty">Sin preventivos esta semana</div>
                      ) : semana.tareas.map(p => {
                        const dias = diasRestantes(p.proxima_fecha);
                        const isVencido = dias <= 0;
                        return (
                          <div key={p.id} className={`pm-semana-tarea ${isVencido ? "tarea-vencida" : ""}`}>
                            <div className="pm-semana-tarea-top">
                              <span className={`v2-crit-badge crit-${p.activos?.criticidad?.toLowerCase() || "baja"}`} style={{ fontSize: "0.65rem", padding: "2px 7px" }}>
                                {p.activos?.criticidad || "Baja"}
                              </span>
                              <span className="pm-semana-fecha">{p.proxima_fecha}</span>
                            </div>
                            <p className="pm-semana-equipo">{p.activos?.nombre || "Equipo"}</p>
                            <p className="pm-semana-desc">{p.descripcion_tarea || "Sin descripción"}</p>
                            <div className="pm-semana-actions">
                              <button
                                className="mini-btn mini-btn-complete"
                                style={{ fontSize: "0.72rem", padding: "4px 10px" }}
                                onClick={() => completarPlan(p)}
                                disabled={completando === p.id}
                              >
                                {completando === p.id ? "..." : "✓ Completar"}
                              </button>
                              <button
                                className="mini-btn"
                                style={{ fontSize: "0.72rem", padding: "4px 10px" }}
                                onClick={() => openEdit(p)}
                              >
                                ✏️
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : (

          /* ══ TAB: CRONOGRAMA ANUAL ══ */
          <div className="anual-container">
            <div className="anual-filters" style={{ flexWrap: "wrap", gap: "12px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <label>Año:</label>
                <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="v2-select" style={{ width: "100px" }}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <label>Mes:</label>
                <select className="v2-select" style={{ width: "140px" }} value={filtroMesAnual} onChange={e => setFiltroMesAnual(e.target.value)}>
                  <option value="todos">Todos los meses</option>
                  {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div className="mant-search-wrap" style={{ width: "220px" }}>
                <span className="search-icon">🔍</span>
                <input className="mant-search-input" placeholder="Buscar equipo o tarea..." value={filtroTexto} onChange={e => setFiltroTexto(e.target.value)} />
              </div>
              <select className="v2-select" style={{ width: "160px" }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                <option value="todos">Todos los estados</option>
                <option value="completado">Completados ✓</option>
                <option value="pendiente">Pendientes</option>
                <option value="vencido">Vencidos !</option>
              </select>
              {cronogramaAnual.length > 0 && (
                <button className="mant-btn-action success" style={{ fontSize: "0.8rem", padding: "8px 16px" }} onClick={syncWithMotor} disabled={syncing}>
                  {syncing ? "Sincronizando..." : "🔄 Sincronizar con Motor"}
                </button>
              )}
            </div>

            {cronogramaAnual.length > 0 && (
              <div className="anual-legend">
                <span className="legend-item"><span className="dot p"></span> Programado (click para completar)</span>
                <span className="legend-item"><span className="dot c"></span> Completado (click para revertir)</span>
                <span className="legend-item"><span className="dot v"></span> Vencido</span>
              </div>
            )}

            {cronogramaAnual.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <p>No hay cronograma importado para el año {selectedYear}</p>
                <button className="mant-btn-action secondary" onClick={() => navigate("/mantenimiento/importar-cronograma")}>
                  📥 Importar Cronograma Excel
                </button>
              </div>
            ) : filtroMesAnual !== "todos" ? (
              /* Vista mes detallado: tarjetas */
              <div className="anual-mes-detalle">
                <h3 className="anual-mes-titulo">{MESES[parseInt(filtroMesAnual) - 1]} {selectedYear} — {cronogramaFiltrado.length} equipo{cronogramaFiltrado.length !== 1 ? "s" : ""}</h3>
                <div className="anual-mes-grid">
                  {cronogramaFiltrado.map(item => {
                    const mesEntry = item.maintenance_schedule_months?.find(m => m.month_number === parseInt(filtroMesAnual));
                    if (!mesEntry) return null;
                    const isCompletado = mesEntry.status === "completado";
                    return (
                      <div key={item.id} className={`anual-mes-card ${isCompletado ? "anual-mes-completado" : "anual-mes-pendiente"}`}>
                        <div className="anual-mes-card-top">
                          <span className="codigo-cell">{item.equipment_code}</span>
                          <button
                            className={`anual-estado-btn ${isCompletado ? "estado-completado" : "estado-pendiente"}`}
                            onClick={() => toggleMonthStatus(mesEntry)}
                            title={isCompletado ? "Marcar como pendiente" : "Marcar como completado"}
                          >
                            {isCompletado ? "✓ Completado" : "○ Pendiente"}
                          </button>
                        </div>
                        <p className="anual-mes-equipo">{item.equipment_name}</p>
                        <p className="anual-mes-tarea">{item.task_description || "—"}</p>
                        {mesEntry.scheduled_week && (
                          <span className="anual-mes-semana">Semana {mesEntry.scheduled_week}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Vista tabla anual (12 meses) */
              <div className="anual-table-wrapper">
                <table className="anual-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Equipo</th>
                      <th>Tarea</th>
                      {MESES_CORTO.map((m, i) => (
                        <th key={m} className={`month-col ${(i + 1) === new Date().getMonth() + 1 ? "month-col-current" : ""}`}>{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cronogramaFiltrado.map(item => (
                      <tr key={item.id}>
                        <td className="codigo-cell">{item.equipment_code}</td>
                        <td className="nombre-cell">{item.equipment_name}</td>
                        <td className="tarea-cell" title={item.task_description}>{item.task_description || "—"}</td>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                          const scheduled = item.maintenance_schedule_months?.find(mon => mon.month_number === m);
                          if (!scheduled) return <td key={m} className="month-col empty"></td>;
                          const statusClass = scheduled.status.toLowerCase();
                          const statusIcon = statusClass === "completado" ? "✓" : statusClass === "vencido" ? "!" : "P";
                          return (
                            <td key={m} className={`month-col has-plan ${statusClass}`}>
                              <div
                                className={`scheduled-badge ${statusClass} badge-clickable`}
                                title={`${scheduled.month_name || MESES[m-1]}: ${scheduled.status} — Click para cambiar`}
                                onClick={() => statusClass !== "vencido" && toggleMonthStatus(scheduled)}
                              >
                                {statusIcon}
                              </div>
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

        {/* MODAL PROGRAMAR / EDITAR */}
        {showModal && (
          <div className="mant-modal-overlay-v2" onClick={() => { setShowModal(false); resetForm(); }}>
            <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <h3>{form.id ? "✏️ Editar Programa" : "📅 Nuevo Programa Preventivo"}</h3>
                <button className="close-btn-v2" onClick={() => { setShowModal(false); resetForm(); }}>✖</button>
              </div>
              <div className="modal-v2-body">
                <div className="v2-form-group">
                  <label>Equipo a Programar <span className="req">*</span></label>
                  <select className="v2-select" value={form.activo_id} onChange={e => setForm({ ...form, activo_id: e.target.value })}>
                    <option value="">Seleccione equipo...</option>
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
                    placeholder="Ej: Cambio de lubricante, limpieza de filtros HEPA, ajuste de correas..." />
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
