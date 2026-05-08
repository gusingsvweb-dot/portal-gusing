import React, { useEffect, useState, useMemo, useCallback } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase, st, ss } from "../api/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { notifyUserByUsername, notifyRoles } from "../api/notifications";
import "./Mantenimiento.css";

const NEXT_STATE = { 1: 13, 13: 14, 14: 15, 15: 15 };
const PRIORITY_LABEL = { 1: "Baja", 2: "Media", 3: "Alta" };
const PRIORITY_CLASS = { 1: "priority-low", 2: "priority-medium", 3: "priority-high" };

export default function Mantenimiento() {
  const navigate = useNavigate();
  const { usuarioActual } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [allRepuestos, setAllRepuestos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [accion, setAccion] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [consumos, setConsumos] = useState([]);
  const [consumosGuardados, setConsumosGuardados] = useState([]);
  const [prioridadId, setPrioridadId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [filtroTecnico, setFiltroTecnico] = useState("todos");
  const [activeTab, setActiveTab] = useState("info");
  const [allPrioridades, setAllPrioridades] = useState([]);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({
    tipo_solicitud_id: "",
    prioridad_id: "",
    descripcion: "",
    activo_id: "",
    tecnico_asignado: ""
  });


  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    
    try {
      const [
        { data: solRaw, error: solErr },
        { data: tiposRaw },
        { data: prioRaw },
        { data: estRaw },
        { data: arsRaw },
        { data: actRaw },
        { data: provRaw },
        { data: repsRaw }
      ] = await Promise.all([
        supabase.from(st("solicitudes")).select("*").eq("area_id", 1).order("id", { ascending: false }),
        supabase.from(st("tipos_solicitud")).select("*"),
        supabase.from(st("prioridades")).select("*"),
        supabase.from(st("estados")).select("*"),
        supabase.from(st("areas")).select("*"),
        supabase.from(st("activos")).select("*"),
        supabase.from(st("proveedores_mant")).select("*"),
        supabase.from(st("repuestos")).select("*")
      ]);

      if (solErr) throw solErr;

      setAllPrioridades(prioRaw || []);
      
      const tMap = new Map(tiposRaw?.map(t => [t.id, t]));
      const pMap = new Map(prioRaw?.map(p => [p.id, p]));
      const eMap = new Map(estRaw?.map(e => [e.id, e]));
      const aMap = new Map(arsRaw?.map(a => [a.id, a]));
      const actMap = new Map(actRaw?.map(a => [a.id, a]));
      const provMap = new Map(provRaw?.map(p => [p.id, p]));

      const hydrated = (solRaw || []).map(s => ({
        ...s,
        tipos_solicitud: tMap.get(s.tipo_solicitud_id),
        prioridades: pMap.get(s.prioridad_id),
        estados: eMap.get(s.estado_id),
        area_destino: aMap.get(s.area_id),
        activos: actMap.get(s.activo_id),
        proveedor: provMap.get(s.proveedor_id)
      }));

      setSolicitudes(hydrated);
      setProveedores(provRaw || []);
      setAllRepuestos(repsRaw || []);

    } catch (err) {
      console.error("Error en loadData:", err);
      setError(`Error al cargar datos: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const stats = useMemo(() => ({
    total: solicitudes.length,
    pendientes: solicitudes.filter(s => s.estado_id === 1).length,
    proceso: solicitudes.filter(s => s.estado_id === 13).length,
    finalizados: solicitudes.filter(s => [14, 15].includes(s.estado_id)).length,
  }), [solicitudes]);

  const filtered = useMemo(() => {
    const q = filtro.toLowerCase();
    let res = solicitudes;
    
    if (filtroTecnico !== "todos") {
      res = res.filter(s => s.tecnico_asignado === filtroTecnico);
    }

    if (q) {
      res = res.filter(s =>
        s.descripcion?.toLowerCase().includes(q) ||
        s.tipos_solicitud?.nombre?.toLowerCase().includes(q) ||
        s.activos?.nombre?.toLowerCase().includes(q) ||
        s.area_solicitante?.toLowerCase().includes(q) ||
        String(s.consecutivo)?.includes(q)
      );
    }
    return res;
  }, [solicitudes, filtro, filtroTecnico]);

  const openModal = async (s) => {
    setSelected(s);
    setProveedorId(s.proveedor_id || "");
    setPrioridadId(s.prioridad_id || "");
    setAccion(s.accion_realizada || "");
    setConsumos([]);
    setError("");
    
    // Si ya está en proceso, abrir directamente la pestaña de Acción
    if (s.estado_id === 13) {
      setActiveTab("accion");
    } else {
      setActiveTab("info");
    }
    if ([14, 15].includes(s.estado_id)) {
      const { data } = await supabase
        .from(st("consumos"))
        .select(`*, repuesto:repuestos(nombre, unidad)`)
        .eq("solicitud_id", s.id);
      setConsumosGuardados(data || []);
    } else {
      setConsumosGuardados([]);
    }
  };

  const closeModal = () => {
    setSelected(null);
    setAccion("");
    setProveedorId("");
    setPrioridadId("");
    setConsumos([]);
    setConsumosGuardados([]);
    setError("");
    setSaving(false);
  };

  const avanzarEstado = async () => {
    if (!selected) return;
    const next = NEXT_STATE[selected.estado_id];
    const update = { estado_id: next };

    if (next === 13 && proveedorId) update.proveedor_id = proveedorId;

    if (next === 14) {
      if (!accion.trim()) { setError("Debes registrar la acción realizada para finalizar."); return; }
      update.accion_realizada = accion;
      update.fecha_cierre = new Date().toISOString();
    }

    setSaving(true);
    if (next === 14 && consumos.length > 0) {
      for (const item of consumos) {
        if (item.repuesto_id && item.cantidad > 0) {
          const rep = allRepuestos.find(r => String(r.id) === String(item.repuesto_id));
          await supabase.from(st("consumos")).insert([{
            solicitud_id: selected.id,
            repuesto_id: item.repuesto_id,
            cantidad: item.cantidad,
            costo_en_momento: rep?.costo || 0,
          }]);
          await supabase.rpc("decrement_repuesto_stock", { row_id: item.repuesto_id, amount: item.cantidad });
        }
      }
    }

    const { error: err } = await supabase.from(st("solicitudes")).update(update).eq("id", selected.id);
    if (err) { alert("Error: " + err.message); setSaving(false); return; }

    if (selected.usuario_id) {
      if (next === 13) {
        await notifyUserByUsername(
          selected.usuario_id,
          "⚙️ Solicitud en Proceso",
          `Tu solicitud M-${selected.consecutivo} (${selected.activos?.nombre || "equipo"}) ha sido tomada y está siendo atendida por el equipo de mantenimiento.`,
          selected.id
        );
      } else if (next === 14) {
        await notifyUserByUsername(
          selected.usuario_id,
          "✅ Orden de Mantenimiento Finalizada",
          `La solicitud M-${selected.consecutivo} para ${selected.activos?.nombre || "equipo"} ha sido finalizada. Por favor, califica el servicio.`,
          selected.id
        );
      }
    }

    closeModal();
    loadData();
  };

  const updateProveedor = async () => {
    if (!proveedorId || !selected) return;
    setSaving(true);
    await supabase.from(st("solicitudes")).update({ proveedor_id: proveedorId }).eq("id", selected.id);
    setSaving(false);
    loadData();
    setSelected(prev => ({ ...prev, proveedor_id: proveedorId }));
  };

  const updatePrioridad = async () => {
    if (!prioridadId || !selected) return;
    setSaving(true);
    await supabase.from(st("solicitudes")).update({ prioridad_id: prioridadId }).eq("id", selected.id);
    setSaving(false);
    loadData();
    // Actualizar localmente para mostrar el cambio sin cerrar modal
    const nuevaPrio = allPrioridades.find(p => String(p.id) === String(prioridadId));
    setSelected(prev => ({ ...prev, prioridad_id: prioridadId, prioridades: nuevaPrio }));
  };

  const updateTecnico = async (tecnico) => {
    if (!selected) return;
    setSaving(true);
    await supabase.from(st("solicitudes")).update({ tecnico_asignado: tecnico }).eq("id", selected.id);
    setSaving(false);
    loadData();
    setSelected(prev => ({ ...prev, tecnico_asignado: tecnico }));

    if (tecnico && selected.usuario_id) {
      await notifyUserByUsername(
        selected.usuario_id,
        "👷 Técnico Asignado",
        `Se asignó a ${tecnico} para atender tu solicitud M-${selected.consecutivo}.`,
        selected.id
      );
    }
    if (tecnico) {
      await notifyRoles(
        ["tecnicomantenimiento"],
        "🔧 Nueva Asignación de Orden",
        `La orden M-${selected.consecutivo} ha sido asignada a ${tecnico}. Revisa tu tablero.`,
        selected.id,
        "info"
      );
    }
  };

  const saveManual = async () => {
    if (!manualForm.activo_id || !manualForm.descripcion || !manualForm.prioridad_id) {
      setError("Completa todos los campos obligatorios.");
      return;
    }
    setSaving(true);
    
    // Consecutivo
    let nextConsecutivo = 1;
    const { data: maxData } = await supabase
      .from(st("solicitudes"))
      .select("consecutivo")
      .eq("area_id", 1)
      .order("consecutivo", { ascending: false })
      .limit(1);
    if (maxData?.length > 0) nextConsecutivo = (maxData[0].consecutivo || 0) + 1;

    const { error: err } = await supabase.from(st("solicitudes")).insert([{
      ...manualForm,
      area_id: 1, // Mantenimiento
      estado_id: 1, // Pendiente
      consecutivo: nextConsecutivo,
      usuario_id: "ADMIN_MANT",
      area_solicitante: "MANTENIMIENTO"
    }]);

    if (err) { alert("Error: " + err.message); }
    else {
      setShowManualForm(false);
      setManualForm({ tipo_solicitud_id: "", prioridad_id: "", descripcion: "", activo_id: "", tecnico_asignado: "" });
      loadData();
    }
    setSaving(false);
  };

  const addConsumo = () => setConsumos(prev => [...prev, { repuesto_id: "", cantidad: 1 }]);
  const removeConsumo = (i) => setConsumos(prev => prev.filter((_, idx) => idx !== i));
  const updateConsumo = (i, field, val) => setConsumos(prev => {
    const copy = [...prev];
    copy[i] = { ...copy[i], [field]: val };
    return copy;
  });

  if (loading) return (
    <><Navbar />
    <div className="mant-container"><div className="mant-skeleton-board">
      {[0,1,2].map(i => <div key={i} className="mant-skeleton-col"><div className="mant-skeleton-header"></div>{[0,1,2].map(j => <div key={j} className="mant-skeleton-card"></div>)}</div>)}
    </div></div><Footer /></>
  );

  return (
    <>
      <Navbar />
      <div className="mant-container">
        {/* HEADER */}
        <header className="mant-header-section">
          <div>
            <h2 className="mant-title">Tablero de Mantenimiento</h2>
            <p className="mant-subtitle">Gestión centralizada de órdenes y equipos — {new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          </div>
          <div className="mant-hero-img-container">
            <img src="/mantenimiento_hero.png" alt="Mantenimiento" className="mant-hero-mini-img" />
          </div>
          <div className="mant-nav-pills">
            <button className="nav-pill active" onClick={() => navigate("/mantenimiento")}>Órdenes</button>
            <button className="nav-pill" onClick={() => navigate("/mantenimiento/equipos")}>Equipos</button>
            <button className="nav-pill" onClick={() => navigate("/mantenimiento/plan-maestro")}>Plan Maestro</button>
            <button className="nav-pill" onClick={() => navigate("/mantenimiento/repuestos")}>Repuestos</button>
            <button className="nav-pill" onClick={() => navigate("/mantenimiento/proyectos")}>Proyectos</button>
            <button className="nav-pill" onClick={() => navigate("/mantenimiento/proveedores")}>Personal Técnico</button>
            <button className="nav-pill kpi-pill" onClick={() => navigate("/kpis-mantenimiento")}>KPIs</button>
            <button className="nav-pill" onClick={() => setShowManualForm(true)}>+ Intervención Manual</button>
          </div>
        </header>

        {/* ERROR MESSAGE */}
        {error && (
          <div className="mant-error-banner">
            ⚠️ {error}
          </div>
        )}

        {/* STAT CARDS */}
        <div className="mant-stats-row">
          <StatCard label="Total Órdenes" value={stats.total} icon="🔧" accent="#6366f1" />
          <StatCard label="Pendientes" value={stats.pendientes} icon="⏳" accent="#f59e0b" />
          <StatCard label="En Proceso" value={stats.proceso} icon="⚙️" accent="#3b82f6" />
          <StatCard label="Finalizadas" value={stats.finalizados} icon="✅" accent="#10b981" />
        </div>

        {/* FILTER BAR */}
        <div className="mant-filter-bar">
          <div className="mant-search-wrap">
            <span className="search-icon">🔍</span>
            <input
              className="mant-search-input"
              placeholder="Buscar por tipo, equipo, área, consecutivo..."
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
            />
            {filtro && <button className="search-clear" onClick={() => setFiltro("")}>✖</button>}
          </div>

          <div className="mant-filter-tec">
            <label>Filtrar por Técnico:</label>
            <select className="v2-select" value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)}>
              <option value="todos">Todos los técnicos</option>
              {proveedores.filter(p => p.tipo === "Interno").map(t => (
                <option key={t.id} value={t.nombre}>{t.nombre}</option>
              ))}
              <option value="">Sin asignar</option>
            </select>
          </div>
          {filtro && <span className="filter-count">{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>}
        </div>

        {/* KANBAN BOARD */}
        <div className="mant-board">
          <KanbanColumn title="Pendientes" type="pending" icon="⏳"
            items={filtered.filter(s => s.estado_id === 1)} onCardClick={openModal} />
          <KanbanColumn title="En Proceso" type="process" icon="⚙️"
            items={filtered.filter(s => s.estado_id === 13)} onCardClick={openModal} />
          <KanbanColumn title="Finalizadas" type="done" icon="✅"
            items={filtered.filter(s => [14, 15].includes(s.estado_id))} onCardClick={openModal} />
        </div>
      </div>

      {/* MODAL */}
      {selected && (
        <div className="mant-modal-overlay" onClick={closeModal}>
          <div className="mant-modal-box" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-box-header">
              <div className="modal-box-title-group">
                <span className={`modal-status-chip chip-${selected.estado_id === 1 ? "pending" : selected.estado_id === 13 ? "process" : "done"}`}>
                  {selected.estados?.nombre}
                </span>
                <h3 className="modal-box-title">
                  {selected.consecutivo ? `M-${selected.consecutivo}` : `#${selected.id}`}
                </h3>
              </div>
              <button className="modal-close-btn" onClick={closeModal}>✖</button>
            </div>

            {/* Tabs */}
            <div className="modal-tabs">
            <button className={`m-tab ${activeTab === "info" ? "active" : ""}`} onClick={() => setActiveTab("info")}>Información</button>
            <button className={`m-tab ${activeTab === "accion" ? "active" : ""}`} onClick={() => setActiveTab("accion")}>Resolución</button>
            {[14, 15].includes(selected.estado_id) && (
              <button className={`m-tab ${activeTab === "consumos" ? "active" : ""}`} onClick={() => setActiveTab("consumos")}>Repuestos</button>
            )}
          </div>
            <div className="modal-box-body">
              {/* TAB: INFO */}
              {activeTab === "info" && (
                <>
                  <div className="modal-info-grid">
                    <InfoBox label="Tipo" value={selected.tipos_solicitud?.nombre} />
                    
                    {/* Prioridad Editable */}
                    <div className="info-item-box">
                      <label>Prioridad</label>
                      {selected.estado_id < 14 ? (
                        <div style={{ display: "flex", gap: "5px" }}>
                          <select 
                            className="v2-select" 
                            style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                            value={prioridadId} 
                            onChange={e => setPrioridadId(e.target.value)}
                          >
                            {allPrioridades
                              .filter(p => p.nombre !== "Muy Alto")
                              .map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)
                            }
                          </select>
                          <button 
                            className="mant-btn-action success" 
                            style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                            onClick={updatePrioridad} 
                            disabled={saving || String(prioridadId) === String(selected.prioridad_id)}
                          >
                            {saving ? "..." : "Guardar"}
                          </button>
                        </div>
                      ) : (
                        <span>{selected.prioridades?.nombre}</span>
                      )}
                    </div>

                    <InfoBox label="Área Solicitante" value={selected.area_solicitante} />
                    <InfoBox label="Solicitante" value={selected.usuario_id} />
                    <InfoBox label="Equipo" value={selected.activos?.nombre || "N/A"} />
                    <InfoBox label="Fecha Apertura" value={new Date(selected.created_at).toLocaleString("es-CO")} />
                    {selected.fecha_cierre && <InfoBox label="Fecha Cierre" value={new Date(selected.fecha_cierre).toLocaleString("es-CO")} />}
                    {selected.proveedor && <InfoBox label="Proveedor" value={selected.proveedor.nombre} />}
                    
                    <div className="info-item-box">
                      <label>Técnico Interno Asignado</label>
                      <select 
                        className="v2-select" 
                        value={selected.tecnico_asignado || ""} 
                        onChange={e => updateTecnico(e.target.value)}
                        disabled={selected.estado_id >= 14}
                      >
                        <option value="">Sin asignar...</option>
                        {proveedores.filter(p => p.tipo === "Interno").map(t => (
                          <option key={t.id} value={t.nombre}>{t.nombre}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="modal-section">
                    <span className="modal-section-label">Descripción del Problema</span>
                    <div className="modal-text-box">{selected.descripcion}</div>
                  </div>
                  {/* Asignar proveedor inline */}
                  {(selected.estado_id === 1 || selected.estado_id === 13) && (
                    <div className="modal-section">
                      <span className="modal-section-label">Asignar Proveedor Externo</span>
                      <div style={{ display: "flex", gap: "10px" }}>
                        <select className="v2-select" value={proveedorId} onChange={e => setProveedorId(e.target.value)} style={{ flex: 1 }}>
                          <option value="">Sin asignar...</option>
                          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre} — {p.especialidad}</option>)}
                        </select>
                        <button className="mant-btn-action success" onClick={updateProveedor} disabled={saving || !proveedorId}>
                          {saving ? "..." : "Guardar"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* TAB: ACCIÓN & REPUESTOS */}
              {activeTab === "accion" && (
                <>
                  <div className="modal-section">
                    <span className="modal-section-label">Acción Realizada por el Técnico</span>
                    {selected.estado_id === 13 ? (
                      <textarea
                        className="modal-textarea"
                        rows={5}
                        value={accion}
                        onChange={e => setAccion(e.target.value)}
                        placeholder="Describe detalladamente el trabajo realizado, partes reemplazadas, calibraciones, observaciones..."
                      />
                    ) : (
                      <div className="modal-text-box resolved">{selected.accion_realizada}</div>
                    )}
                    {error && <p className="modal-error">{error}</p>}
                  </div>

                  {/* Repuestos consumidos */}
                  {selected.estado_id === 13 && (
                    <div className="modal-section">
                      <span className="modal-section-label">Repuestos / Insumos Utilizados</span>
                      <div className="consumos-list">
                        {consumos.map((c, i) => (
                          <div key={i} className="consumo-row">
                            <select className="v2-select" style={{ flex: 2 }} value={c.repuesto_id}
                              onChange={e => updateConsumo(i, "repuesto_id", e.target.value)}>
                              <option value="">Seleccione insumo...</option>
                              {allRepuestos.map(r => (
                                <option key={r.id} value={r.id}>
                                  {r.nombre} (Stock: {r.stock} {r.unidad})
                                </option>
                              ))}
                            </select>
                            <input type="number" min="0.01" step="0.01" className="v2-input consumo-qty"
                              value={c.cantidad} placeholder="Cant."
                              onChange={e => updateConsumo(i, "cantidad", parseFloat(e.target.value) || 0)} />
                            <button className="consumo-remove" onClick={() => removeConsumo(i)}>✖</button>
                          </div>
                        ))}
                        <button className="mant-btn-action secondary" style={{ marginTop: "8px" }} onClick={addConsumo}>
                          + Añadir Repuesto
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* TAB: CONSUMOS GUARDADOS */}
              {activeTab === "consumos" && (
                <div className="modal-section">
                  <span className="modal-section-label">Repuestos Consumidos</span>
                  {consumosGuardados.length === 0 ? (
                    <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>No se registraron consumos en esta orden.</p>
                  ) : (
                    <table className="consumos-table">
                      <thead>
                        <tr><th>Insumo</th><th>Cantidad</th><th>Unidad</th><th>Costo Unit.</th><th>Subtotal</th></tr>
                      </thead>
                      <tbody>
                        {consumosGuardados.map(c => (
                          <tr key={c.id}>
                            <td>{c.repuesto?.nombre}</td>
                            <td>{c.cantidad}</td>
                            <td>{c.repuesto?.unidad}</td>
                            <td>${Number(c.costo_en_momento || 0).toLocaleString()}</td>
                            <td><strong>${(Number(c.costo_en_momento || 0) * c.cantidad).toLocaleString()}</strong></td>
                          </tr>
                        ))}
                        <tr className="consumos-total">
                          <td colSpan={4}><strong>TOTAL COSTO</strong></td>
                          <td><strong>${consumosGuardados.reduce((sum, c) => sum + (Number(c.costo_en_momento || 0) * c.cantidad), 0).toLocaleString()}</strong></td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              )}
              {selected.estado_id === 15 && (
                <div style={{ padding: "20px", background: "#ecfdf5", borderRadius: "12px", color: "#047857", textAlign: "center", fontWeight: "600", marginTop: "20px" }}>
                  ✔ Orden Cerrada y Calificada.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="modal-box-footer">
              <button className="mant-btn-action secondary" onClick={closeModal}>Cerrar</button>
              {selected.estado_id < 14 && (
                <button className="mant-btn-action primary" onClick={avanzarEstado} disabled={saving}>
                  {saving ? "Guardando..." : selected.estado_id === 1 ? "Iniciar Trabajo →" : "Finalizar y Cerrar Orden ✓"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

        {/* MANUAL INTERVENTION MODAL */}
        {showManualForm && (
          <div className="mant-modal-overlay-v2" onClick={() => setShowManualForm(false)}>
            <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <h3>🛠️ Registro de Intervención Manual</h3>
                <button className="close-btn-v2" onClick={() => setShowManualForm(false)}>✖</button>
              </div>
              <div className="modal-v2-body">
                <div className="v2-form-group">
                  <label>Equipo Relacionado *</label>
                  <select className="v2-select" value={manualForm.activo_id} onChange={e => setManualForm({ ...manualForm, activo_id: e.target.value })}>
                    <option value="">Seleccione equipo...</option>
                    {solicitudes.reduce((acc, s) => {
                      if (s.activos && !acc.find(a => a.id === s.activo_id)) acc.push(s.activos);
                      return acc;
                    }, []).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Tipo de Solicitud</label>
                    <select className="v2-select" value={manualForm.tipo_solicitud_id} onChange={e => setManualForm({ ...manualForm, tipo_solicitud_id: e.target.value })}>
                      <option value="">Seleccione tipo...</option>
                      <option value="2">Mantenimiento Correctivo</option>
                      <option value="5">Mantenimiento Preventivo</option>
                    </select>
                  </div>
                  <div className="v2-form-group">
                    <label>Prioridad *</label>
                    <select className="v2-select" value={manualForm.prioridad_id} onChange={e => setManualForm({ ...manualForm, prioridad_id: e.target.value })}>
                      <option value="">Seleccione...</option>
                      {allPrioridades.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                </div>
                <div className="v2-form-group">
                  <label>Asignar a Técnico</label>
                    <select className="v2-select" value={manualForm.tecnico_asignado} 
                      onChange={e => setManualForm({...manualForm, tecnico_asignado: e.target.value})}>
                      <option value="">Seleccione técnico...</option>
                      {proveedores.filter(p => p.tipo === "Interno").map(t => (
                        <option key={t.id} value={t.nombre}>{t.nombre}</option>
                      ))}
                    </select>
                </div>
                <div className="v2-form-group">
                  <label>Descripción del Trabajo *</label>
                  <textarea className="v2-input" rows={3} value={manualForm.descripcion} onChange={e => setManualForm({ ...manualForm, descripcion: e.target.value })} />
                </div>
              </div>
              <div className="modal-v2-footer">
                <button className="v2-btn-secondary" onClick={() => setShowManualForm(false)}>Cancelar</button>
                <button className="v2-btn-primary" onClick={saveManual} disabled={saving}>Registrar Orden</button>
              </div>
            </div>
          </div>
        )}

      <Footer />
    </>
  );
}

function StatCard({ label, value, icon, accent }) {
  return (
    <div className="mant-stat-card" style={{ "--stat-accent": accent }}>
      <div className="stat-card-icon">{icon}</div>
      <div className="stat-card-body">
        <span className="stat-card-value">{value}</span>
        <span className="stat-card-label">{label}</span>
      </div>
      <div className="stat-card-bar"></div>
    </div>
  );
}

function KanbanColumn({ title, type, icon, items, onCardClick }) {
  return (
    <div className="mant-column">
      <div className={`col-header col-${type}`}>
        <div className="col-header-left">
          <span className="col-icon">{icon}</span>
          <h3>{title}</h3>
        </div>
        <span className="count-badge">{items.length}</span>
      </div>
      <div className="mant-list-area">
        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <p>Sin solicitudes aquí</p>
          </div>
        ) : items.map(s => <KanbanCard key={s.id} data={s} onClick={() => onCardClick(s)} />)}
      </div>
    </div>
  );
}

function KanbanCard({ data, onClick }) {
  const priorityClass = PRIORITY_CLASS[data.prioridad_id] || "priority-low";
  const tagMatch = data.descripcion?.match(/^\[([^\]]+)\]/);
  const displayDesc = tagMatch ? data.descripcion.replace(tagMatch[0], "").trim() : data.descripcion;
  const isUrgent = data.prioridad_id === 3;

  return (
    <div className={`mant-card ${priorityClass} ${isUrgent ? "card-urgent" : ""}`} onClick={onClick}>
      <div className="card-top">
        <span className="card-id-tag">{data.consecutivo ? `M-${data.consecutivo}` : `#${data.id}`}</span>
        <span className={`card-prio-badge prio-${data.prioridad_id}`}>{data.prioridades?.nombre || PRIORITY_LABEL[data.prioridad_id]}</span>
      </div>

      <h4 className="card-type">{data.tipos_solicitud?.nombre}</h4>
      <p className="card-desc">{displayDesc}</p>

      <div className="card-meta">
        <span className="card-meta-item">👤 {data.area_solicitante || "—"}</span>
        {data.activos && <span className="card-meta-item">⚙️ {data.activos.nombre}</span>}
      </div>

      {data.proveedor && (
        <div className="card-proveedor-tag">🚚 {data.proveedor.nombre}</div>
      )}

      <div className="card-footer">
        <span className="card-date">{new Date(data.created_at).toLocaleDateString("es-CO")}</span>
        {data.activos?.criticidad === "Alta" && <span className="crit-mini-badge">CRÍTICO</span>}
      </div>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div className="info-item-box">
      <label>{label}</label>
      <span>{value || "—"}</span>
    </div>
  );
}
