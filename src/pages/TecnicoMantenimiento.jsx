import React, { useEffect, useState, useMemo, useCallback } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase, st } from "../api/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { notifyUserByUsername, notifyRoles } from "../api/notifications";
import "./Mantenimiento.css";

const NEXT_STATE = { 1: 13, 13: 14, 14: 15, 15: 15 };
const PRIORITY_LABEL = { 1: "Baja", 2: "Media", 3: "Alta" };
const PRIORITY_CLASS = { 1: "priority-low", 2: "priority-medium", 3: "priority-high" };

export default function TecnicoMantenimiento() {
  const { usuarioActual } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [allRepuestos, setAllRepuestos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [accion, setAccion] = useState("");
  const [consumos, setConsumos] = useState([]);
  const [consumosGuardados, setConsumosGuardados] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [activeTab, setActiveTab] = useState("info");

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
        { data: repsRaw }
      ] = await Promise.all([
        supabase.from(st("solicitudes")).select("*").order("id", { ascending: false }),
        supabase.from(st("tipos_solicitud")).select("*"),
        supabase.from(st("prioridades")).select("*"),
        supabase.from(st("estados")).select("*"),
        supabase.from(st("areas")).select("*"),
        supabase.from(st("activos")).select("*"),
        supabase.from(st("repuestos")).select("*")
      ]);

      if (solErr) throw solErr;

      const tMap = new Map(tiposRaw?.map(t => [t.id, t]));
      const pMap = new Map(prioRaw?.map(p => [p.id, p]));
      const eMap = new Map(estRaw?.map(e => [e.id, e]));
      const aMap = new Map(arsRaw?.map(a => [a.id, a]));
      const actMap = new Map(actRaw?.map(a => [a.id, a]));

      const hydrated = (solRaw || []).map(s => ({
        ...s,
        tipos_solicitud: tMap.get(s.tipo_solicitud_id),
        prioridades: pMap.get(s.prioridad_id),
        estados: eMap.get(s.estado_id),
        area_destino: aMap.get(s.area_id),
        activos: actMap.get(s.activo_id)
      }));

      setSolicitudes(hydrated);
      setAllRepuestos(repsRaw || []);

    } catch (err) {
      console.error("Error en loadData:", err);
      setError(`Error al cargar datos: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    const q = filtro.toLowerCase();
    
    // Normalizamos el usuario actual (ej. juan.b) para compararlo con el tecnico_asignado
    const formatName = (name) => name ? name.trim().toLowerCase().replace(/\s+/g, '.') : "";
    const currentUsername = usuarioActual?.usuario || "";

    // Filtrar solo las del técnico logueado
    let res = solicitudes.filter(s => formatName(s.tecnico_asignado) === formatName(currentUsername));

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
  }, [solicitudes, filtro, usuarioActual]);

  const stats = useMemo(() => ({
    total: filtered.length,
    pendientes: filtered.filter(s => s.estado_id === 1).length,
    proceso: filtered.filter(s => s.estado_id === 13).length,
    finalizados: filtered.filter(s => [14, 15].includes(s.estado_id)).length,
  }), [filtered]);

  const openModal = async (s) => {
    setSelected(s);
    setAccion(s.accion_realizada || "");
    setConsumos([]);
    setError("");
    
    // Si ya está en proceso, abrir directamente la pestaña de Acción
    if (s.estado_id === 13) {
      setActiveTab("accion");
    } else {
      setActiveTab("info");
    }

    if (s.estado_id >= 14) {
      try {
        const { data, error } = await supabase.from(st("consumos_repuestos"))
          .select("*, repuesto:repuesto_id(*)")
          .eq("solicitud_id", s.id);
        if (!error && data) setConsumosGuardados(data);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const closeModal = () => {
    setSelected(null);
    setAccion("");
    setConsumos([]);
    setConsumosGuardados([]);
    setActiveTab("info");
  };

  const addConsumo = () => setConsumos([...consumos, { repuesto_id: "", cantidad: "" }]);
  const updateConsumo = (index, field, value) => {
    const updated = [...consumos];
    updated[index][field] = value;
    setConsumos(updated);
  };
  const removeConsumo = (index) => setConsumos(consumos.filter((_, i) => i !== index));

  const avanzarEstado = async () => {
    if (!selected) return;
    const isEnProceso = selected.estado_id === 13;
    
    // Validar antes de finalizar
    if (isEnProceso && !accion.trim()) {
      setError("Debes describir el trabajo realizado (Resolución) antes de finalizar.");
      setActiveTab("accion");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const nextEstado = NEXT_STATE[selected.estado_id];
      const updates = { estado_id: nextEstado };
      let notifMsg = `El técnico ha iniciado el trabajo.`;

      if (isEnProceso) {
        updates.accion_realizada = accion;
        updates.fecha_cierre = new Date().toISOString();
        notifMsg = `El técnico ha finalizado el trabajo.`;
      }

      const { error: updError } = await supabase
        .from(st("solicitudes"))
        .update(updates)
        .eq("id", selected.id);

      if (updError) throw updError;

      // Guardar Consumos (Repuestos) al finalizar
      if (isEnProceso && consumos.length > 0) {
        const validConsumos = consumos.filter(c => c.repuesto_id && c.cantidad > 0);
        if (validConsumos.length > 0) {
          const consumosData = validConsumos.map(c => {
            const repInfo = allRepuestos.find(r => String(r.id) === String(c.repuesto_id));
            return {
              solicitud_id: selected.id,
              repuesto_id: c.repuesto_id,
              cantidad: c.cantidad,
              costo_en_momento: repInfo ? repInfo.precio_unitario : 0
            };
          });

          const { error: consError } = await supabase.from(st("consumos_repuestos")).insert(consumosData);
          if (consError) throw consError;

          // Descontar inventario
          for (let c of validConsumos) {
            await supabase.rpc('decrementar_stock_repuesto', { rep_id: c.repuesto_id, cant: c.cantidad });
          }
        }
      }

      // Notificar al usuario solicitante
      if (selected.usuario_id) {
        const orderId = selected.consecutivo ? `M-${selected.consecutivo}` : `#${selected.id}`;
        const equipoNombre = selected.activos?.nombre || "equipo";
        if (isEnProceso) {
          await notifyUserByUsername(
            selected.usuario_id,
            "✅ Orden de Mantenimiento Finalizada",
            `La solicitud ${orderId} para ${equipoNombre} ha sido completada por el técnico. Por favor, califica el servicio.`,
            selected.id
          );
          await notifyRoles(
            ["mantenimiento"],
            "✅ Orden Completada por Técnico",
            `El técnico ha finalizado la orden ${orderId} (${equipoNombre}). Acción: ${accion.substring(0, 100)}${accion.length > 100 ? "..." : ""}`,
            selected.id,
            "info"
          );
        } else {
          await notifyUserByUsername(
            selected.usuario_id,
            "⚙️ Tu solicitud está en proceso",
            `El técnico ha iniciado el trabajo en la solicitud ${orderId} para ${equipoNombre}.`,
            selected.id
          );
        }
      }

      await loadData();
      closeModal();
    } catch (err) {
      console.error(err);
      setError("Error al guardar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Navbar rol="tecnicomantenimiento" />
      <div className="mant-layout">
        <header className="mant-header">
          <div>
            <h1 className="mant-title">Mis Órdenes de Mantenimiento</h1>
            <p className="mant-subtitle">Tablero del Técnico — {new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          </div>
          <div className="mant-hero-img-container">
            <img src="/mantenimiento_hero.png" alt="Mantenimiento" className="mant-hero-mini-img" />
          </div>
        </header>

        {loading ? (
          <div style={{ textAlign: "center", padding: "50px", color: "#64748b" }}>Cargando órdenes asignadas...</div>
        ) : (
          <>
            {/* STAT CARDS */}
            <div className="mant-stats-row">
              <StatCard label="Mis Órdenes" value={stats.total} icon="🔧" accent="#6366f1" />
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
                  placeholder="Buscar por equipo, área o consecutivo..."
                  value={filtro}
                  onChange={e => setFiltro(e.target.value)}
                />
                {filtro && <button className="search-clear" onClick={() => setFiltro("")}>✖</button>}
              </div>
            </div>

            {/* KANBAN BOARD */}
            <div className="mant-board">
              <KanbanColumn title="Asignadas" type="pending" icon="⏳"
                items={filtered.filter(s => s.estado_id === 1)} onCardClick={openModal} />
              <KanbanColumn title="En Proceso" type="process" icon="⚙️"
                items={filtered.filter(s => s.estado_id === 13)} onCardClick={openModal} />
              <KanbanColumn title="Terminadas" type="done" icon="✅"
                items={filtered.filter(s => [14, 15].includes(s.estado_id))} onCardClick={openModal} />
            </div>
          </>
        )}
      </div>

      {/* MODAL DETALLE DE ORDEN */}
      {selected && (
        <div className="mant-modal-overlay-v2" onClick={closeModal}>
          <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-v2-header">
              <div className="modal-title-wrap">
                <span className={`modal-state-badge state-${selected.estado_id}`}>
                  {selected.estados?.nombre?.toUpperCase()}
                </span>
                <h3>{selected.consecutivo ? `M-${selected.consecutivo}` : `Orden #${selected.id}`}</h3>
              </div>
              <button className="close-btn-v2" onClick={closeModal}>✖</button>
            </div>

            {error && <div className="modal-error-banner">⚠️ {error}</div>}

            <div className="modal-tabs">
              <button className={`m-tab ${activeTab === "info" ? "active" : ""}`} onClick={() => setActiveTab("info")}>Información</button>
              <button className={`m-tab ${activeTab === "accion" ? "active" : ""}`} onClick={() => setActiveTab("accion")}>Resolución</button>
              {[13, 14, 15].includes(selected.estado_id) && (
                <button className={`m-tab ${activeTab === "consumos" ? "active" : ""}`} onClick={() => setActiveTab("consumos")}>Repuestos</button>
              )}
            </div>

            <div className="modal-box-body">
              {/* TAB: INFO */}
              {activeTab === "info" && (
                <>
                  <div className="modal-info-grid">
                    <InfoBox label="Tipo" value={selected.tipos_solicitud?.nombre} />
                    <InfoBox label="Prioridad" value={selected.prioridades?.nombre} />
                    <InfoBox label="Área Solicitante" value={selected.area_solicitante} />
                    <InfoBox label="Equipo" value={selected.activos?.nombre || "N/A"} />
                  </div>
                  <div className="modal-section">
                    <span className="modal-section-label">Descripción del Problema</span>
                    <div className="modal-text-box">{selected.descripcion}</div>
                  </div>
                </>
              )}

              {/* TAB: RESOLUCIÓN */}
              {activeTab === "accion" && (
                <div className="modal-section">
                  <span className="modal-section-label">Trabajo Realizado</span>
                  {selected.estado_id < 14 ? (
                    <textarea 
                      className="v2-input" 
                      rows={5} 
                      placeholder="Describe qué se le hizo al equipo, repuestos cambiados o acciones tomadas..."
                      value={accion}
                      onChange={e => setAccion(e.target.value)}
                    />
                  ) : (
                    <div className="modal-text-box success-tint">{selected.accion_realizada || "No se registró descripción."}</div>
                  )}
                </div>
              )}

              {/* TAB: REPUESTOS */}
              {activeTab === "consumos" && selected.estado_id === 13 && (
                <div className="modal-section">
                  <span className="modal-section-label">Registro de Repuestos Utilizados</span>
                  <div className="consumos-editor">
                    {consumos.map((c, i) => (
                      <div key={i} className="consumo-row">
                        <select className="v2-select" value={c.repuesto_id} onChange={e => updateConsumo(i, "repuesto_id", e.target.value)}>
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

              {/* TAB: REPUESTOS GUARDADOS */}
              {activeTab === "consumos" && selected.estado_id >= 14 && (
                <div className="modal-section">
                  <span className="modal-section-label">Repuestos Consumidos</span>
                  {consumosGuardados.length === 0 ? (
                    <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>No se registraron consumos en esta orden.</p>
                  ) : (
                    <table className="consumos-table">
                      <thead>
                        <tr><th>Insumo</th><th>Cantidad</th><th>Unidad</th></tr>
                      </thead>
                      <tbody>
                        {consumosGuardados.map(c => (
                          <tr key={c.id}>
                            <td>{c.repuesto?.nombre}</td>
                            <td>{c.cantidad}</td>
                            <td>{c.repuesto?.unidad}</td>
                          </tr>
                        ))}
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
        <span className="card-meta-item">⚙️ {data.activos?.nombre || "Sin Equipo"}</span>
      </div>

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
