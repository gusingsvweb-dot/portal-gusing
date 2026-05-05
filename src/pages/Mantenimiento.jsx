import React, { useEffect, useState, useMemo, useCallback } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase, st, ss } from "../api/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [activeTab, setActiveTab] = useState("info");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(""); // Limpiar errores previos
    
    try {
      const selectStr = ss(`*, tipos_solicitud(nombre), prioridades(nombre), estados(nombre), area_destino:areas(nombre), activos(nombre, tipo, codigo, criticidad), proveedor:proveedores_mant(nombre)`);
      console.log("Consultando tablero con:", selectStr);

      const { data: sol, error: solErr } = await supabase
        .from(st("solicitudes"))
        .select(selectStr)
        .eq("area_id", 1)
        .order("id", { ascending: false });

      if (solErr) {
        console.error("Error cargando solicitudes:", solErr);
        setError(`Error al cargar órdenes: ${solErr.message} (${solErr.code})`);
      } else {
        setSolicitudes(sol || []);
      }

      const [{ data: prov }, { data: reps }] = await Promise.all([
        supabase.from(st("proveedores_mant")).select("*").order("nombre"),
        supabase.from(st("repuestos")).select("*").order("nombre"),
      ]);
      
      setProveedores(prov || []);
      setAllRepuestos(reps || []);

    } catch (err) {
      console.error("Error inesperado en loadData:", err);
      setError("Ocurrió un error inesperado al conectar con el servidor.");
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
    if (!filtro.trim()) return solicitudes;
    const q = filtro.toLowerCase();
    return solicitudes.filter(s =>
      s.descripcion?.toLowerCase().includes(q) ||
      s.tipos_solicitud?.nombre?.toLowerCase().includes(q) ||
      s.activos?.nombre?.toLowerCase().includes(q) ||
      s.area_solicitante?.toLowerCase().includes(q) ||
      String(s.consecutivo)?.includes(q)
    );
  }, [solicitudes, filtro]);

  const openModal = async (s) => {
    setSelected(s);
    setProveedorId(s.proveedor_id || "");
    setAccion(s.accion_realizada || "");
    setConsumos([]);
    setError("");
    setActiveTab("info");
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
            <p className="mant-subtitle">Gestión centralizada de órdenes y activos — {new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          </div>
          <div className="mant-nav-pills">
            <button className="nav-pill active" onClick={() => navigate("/mantenimiento")}>Órdenes</button>
            <button className="nav-pill" onClick={() => navigate("/mantenimiento/activos")}>Activos</button>
            <button className="nav-pill" onClick={() => navigate("/mantenimiento/plan-maestro")}>Plan Maestro</button>
            <button className="nav-pill" onClick={() => navigate("/mantenimiento/repuestos")}>Repuestos</button>
            <button className="nav-pill" onClick={() => navigate("/mantenimiento/proveedores")}>Proveedores</button>
            <button className="nav-pill kpi-pill" onClick={() => navigate("/kpis-mantenimiento")}>KPIs</button>
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
              placeholder="Buscar por tipo, activo, área, consecutivo..."
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
            />
            {filtro && <button className="search-clear" onClick={() => setFiltro("")}>✖</button>}
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
              <button className={`modal-tab ${activeTab === "info" ? "active" : ""}`} onClick={() => setActiveTab("info")}>Información</button>
              {selected.estado_id >= 13 && <button className={`modal-tab ${activeTab === "accion" ? "active" : ""}`} onClick={() => setActiveTab("accion")}>Acción & Repuestos</button>}
              {[14,15].includes(selected.estado_id) && <button className={`modal-tab ${activeTab === "consumos" ? "active" : ""}`} onClick={() => setActiveTab("consumos")}>Consumos</button>}
            </div>

            <div className="modal-box-body">
              {/* TAB: INFO */}
              {activeTab === "info" && (
                <>
                  <div className="modal-info-grid">
                    <InfoBox label="Tipo" value={selected.tipos_solicitud?.nombre} />
                    <InfoBox label="Prioridad" value={selected.prioridades?.nombre} />
                    <InfoBox label="Área Solicitante" value={selected.area_solicitante} />
                    <InfoBox label="Solicitante" value={selected.usuario_id} />
                    <InfoBox label="Activo Relacionado" value={selected.activos?.nombre || "N/A"} />
                    <InfoBox label="Fecha Apertura" value={new Date(selected.created_at).toLocaleString("es-CO")} />
                    {selected.fecha_cierre && <InfoBox label="Fecha Cierre" value={new Date(selected.fecha_cierre).toLocaleString("es-CO")} />}
                    {selected.proveedor && <InfoBox label="Proveedor" value={selected.proveedor.nombre} />}
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
