import React, { useEffect, useState, useMemo } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase, st, ss } from "../api/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import "./Mantenimiento.css";

export default function Mantenimiento() {
  const navigate = useNavigate();
  const { usuarioActual } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [selected, setSelected] = useState(null);
  const [accion, setAccion] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [allRepuestos, setAllRepuestos] = useState([]);
  const [consumos, setConsumos] = useState([]); // [{id, repuesto_id, cantidad}]

  // ============================
  // CARGAR DATOS
  // ============================
  async function loadData() {
    setLoading(true);
    // 1. Cargar Solicitudes con Joins
    const { data: sol, error: errSol } = await supabase
      .from(st("solicitudes"))
      .select(ss(`
        *,
        tipos_solicitud ( nombre ),
        prioridades ( nombre ),
        estados ( nombre ),
        area_destino:areas ( nombre ),
        activos ( nombre, tipo, codigo ),
        proveedor:proveedores_mant ( nombre )
      `))
      .eq("area_id", 1) // SOLO MANTENIMIENTO
      .order("id", { ascending: false });

    // 2. Cargar Proveedores
    const { data: prov } = await supabase.from(st("proveedores_mant")).select("*").order("nombre");

    // 3. Cargar Repuestos para el selector
    const { data: reps } = await supabase.from(st("repuestos")).select("*").order("nombre");

    if (!errSol) setSolicitudes(sol || []);
    setProveedores(prov || []);
    setAllRepuestos(reps || []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  // ============================
  // STATS CALCULATIONS
  // ============================
  const stats = useMemo(() => {
    return {
      total: solicitudes.length,
      pendientes: solicitudes.filter(s => s.estado_id === 1).length,
      proceso: solicitudes.filter(s => s.estado_id === 13).length,
      finalizados: solicitudes.filter(s => [14, 15].includes(s.estado_id)).length
    };
  }, [solicitudes]);

  // ============================
  // AVANZAR ESTADO
  // ============================
  async function avanzarEstado() {
    if (!selected) return;

    const current = selected.estado_id;
    const next = {
      1: 13,  // Pendiente → En proceso
      13: 14, // En proceso → Finalizado
      14: 15, // Finalizado → Calificado
      15: 15
    }[current];

    const update = { estado_id: next };

    // Si pasa a PROCESO → puede asignar proveedor
    if (next === 13 && proveedorId) {
      update.proveedor_id = proveedorId;
    }

    // Si finaliza → requiere acción
    if (next === 14) {
      if (!accion.trim()) {
        setError("Debes registrar la acción realizada para finalizar.");
        return;
      }
      update.accion_realizada = accion;
      update.fecha_cierre = new Date().toISOString();

      // Guardar consumos de repuestos
      if (consumos.length > 0) {
        for (const item of consumos) {
          if (item.repuesto_id && item.cantidad > 0) {
            // Log de consumo
            await supabase.from(st("consumos")).insert([{
              solicitud_id: selected.id,
              repuesto_id: item.repuesto_id,
              cantidad: item.cantidad
            }]);
            // Decrementar stock
            await supabase.rpc('decrement_repuesto_stock', { 
              row_id: item.repuesto_id, 
              amount: item.cantidad 
            });
          }
        }
      }
    }

    const { error } = await supabase
      .from(st("solicitudes"))
      .update(update)
      .eq("id", selected.id);

    if (error) {
      alert("Error guardando: " + error.message);
      return;
    }

    closeModal();
    loadData();
  }

  const closeModal = () => {
    setSelected(null);
    setAccion("");
    setProveedorId("");
    setConsumos([]);
    setError("");
  };

  const openModal = (s) => {
    setSelected(s);
    setProveedorId(s.proveedor_id || "");
    setAccion(s.accion_realizada || "");
  };

  if (loading) return <div className="mant-container"><h3>Actualizando tablero...</h3></div>;

  return (
    <>
      <Navbar />

      <div className="mant-container">
        <header className="mant-header-section">
          <div>
            <h2 className="mant-title">🔧 Mantenimiento Professional</h2>
            <p className="mant-subtitle">Gestión centralizada de activos y servicios</p>
          </div>
          <div className="mant-actions-group" style={{ display: "flex", gap: "10px" }}>
            <button className="mant-btn primary" onClick={() => navigate("/mantenimiento/activos")}>
              🏢 Activos
            </button>
            <button className="mant-btn" style={{ background: "#7c3aed", color: "white" }} onClick={() => navigate("/mantenimiento/plan-maestro")}>
              📅 Plan Maestro
            </button>
            <button className="mant-btn" style={{ background: "#f59e0b", color: "white" }} onClick={() => navigate("/mantenimiento/repuestos")}>
              ⚙️ Repuestos
            </button>
            <button className="mant-btn primary" onClick={() => navigate("/mantenimiento/proveedores")}>
              🚚 Proveedores
            </button>
            <button className="mant-btn secondary" onClick={() => navigate("/kpis-mantenimiento")}>
              📊 Ver KPIs
            </button>
          </div>
        </header>

        {/* STAT CARDS */}
        <div className="mant-stats-row">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Pendientes" value={stats.pendientes} />
          <StatCard label="En Proceso" value={stats.proceso} />
          <StatCard label="Finalizados" value={stats.finalizados} />
        </div>

        <div className="mant-board">
          <Column 
            title="Pendientes" 
            type="pending" 
            items={solicitudes.filter(s => s.estado_id === 1)} 
            onCardClick={openModal} 
          />
          <Column 
            title="En Proceso" 
            type="process" 
            items={solicitudes.filter(s => s.estado_id === 13)} 
            onCardClick={openModal} 
          />
          <Column 
            title="Finalizados" 
            type="done" 
            items={solicitudes.filter(s => [14, 15].includes(s.estado_id))} 
            onCardClick={openModal} 
          />
        </div>
      </div>

      {/* MODAL DETALLE */}
      {selected && (
        <div className="mant-modal-overlay" onClick={closeModal}>
          <div className="mant-modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="status-badge-premium" style={{ 
                  background: selected.estado_id === 1 ? "var(--status-pending)" : 
                             selected.estado_id === 13 ? "var(--status-process)" : "var(--status-done)",
                  color: "white"
                }}>
                  {selected.estados?.nombre}
                </span>
                <h3>{selected.consecutivo ? `M-${selected.consecutivo}` : `#${selected.id}`}</h3>
              </div>
              <button className="close-btn" onClick={closeModal}>✖</button>
            </div>

            <div className="modal-body">
              <div className="info-grid-premium">
                <InfoBox label="Tipo" value={selected.tipos_solicitud?.nombre} />
                <InfoBox label="Prioridad" value={selected.prioridades?.nombre} />
                <InfoBox label="Solicitante" value={selected.usuario_id} />
                <InfoBox label="Área" value={selected.area_solicitante} />
                <InfoBox label="Activo Relacionado" value={selected.activos?.nombre || "N/A"} />
                <InfoBox label="Fecha" value={new Date(selected.created_at).toLocaleDateString()} />
              </div>

              <div className="desc-section">
                <span className="section-label">📝 Descripción</span>
                <div className="text-box-premium">{selected.descripcion}</div>
              </div>

              {/* ASIGNACIÓN DE PROVEEDOR (Solo en Pendiente o Proceso) */}
              {(selected.estado_id === 1 || selected.estado_id === 13) && (
                <div className="desc-section">
                  <span className="section-label">🚚 Asignar Proveedor</span>
                  <select 
                    className="mant-select" 
                    value={proveedorId} 
                    onChange={e => setProveedorId(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid var(--mant-border)" }}
                  >
                    <option value="">Seleccione proveedor...</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.especialidad})</option>)}
                  </select>
                </div>
              )}

              {/* ACCIÓN REALIZADA */}
              {(selected.estado_id === 13 || selected.estado_id >= 14) && (
                <div className="desc-section">
                  <span className="section-label">⚙️ Acción Realizada</span>
                  {selected.estado_id === 13 ? (
                    <textarea
                      className="mant-textarea"
                      value={accion}
                      onChange={(e) => setAccion(e.target.value)}
                      placeholder="Describe detalladamente el trabajo realizado..."
                    />
                  ) : (
                    <div className="text-box-premium" style={{ background: "hsla(142, 71%, 95%, 1)", borderColor: "var(--status-done)" }}>
                      {selected.accion_realizada}
                    </div>
                  )}
                  {error && <p className="error-msg">{error}</p>}
                </div>
              )}

              {/* GESTIÓN DE CONSUMOS (Solo en Proceso o Finalizado) */}
              {(selected.estado_id === 13 || selected.estado_id >= 14) && (
                <div className="desc-section" style={{ marginTop: "20px", borderTop: "1px solid #efefef", paddingTop: "20px" }}>
                  <span className="section-label">📦 Repuestos Utilizados</span>
                  {selected.estado_id === 13 ? (
                    <div>
                      {consumos.map((c, idx) => (
                        <div key={idx} style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                          <select 
                            className="mant-select" 
                            style={{ flex: 2 }}
                            value={c.repuesto_id}
                            onChange={(e) => {
                              const newC = [...consumos];
                              newC[idx].repuesto_id = e.target.value;
                              setConsumos(newC);
                            }}
                          >
                            <option value="">Seleccione repuesto...</option>
                            {allRepuestos.map(r => <option key={r.id} value={r.id}>{r.nombre} (Stock: {r.stock})</option>)}
                          </select>
                          <input 
                            type="number" 
                            className="mant-input" 
                            style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "1px solid #ddd" }}
                            placeholder="Cant"
                            value={c.cantidad}
                            onChange={(e) => {
                              const newC = [...consumos];
                              newC[idx].cantidad = parseFloat(e.target.value);
                              setConsumos(newC);
                            }}
                          />
                          <button onClick={() => setConsumos(consumos.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: "red", cursor: "pointer" }}>✖</button>
                        </div>
                      ))}
                      <button 
                        className="mini-btn" 
                        style={{ background: "#f1f5f9", color: "#475569", marginTop: "10px" }}
                        onClick={() => setConsumos([...consumos, { repuesto_id: "", cantidad: 0 }])}
                      >
                        + Añadir Repuesto
                      </button>
                    </div>
                  ) : (
                    <div className="repuestos-consumidos-list">
                      {/* Aquí se cargarían los consumos reales desde la base de datos si fuera necesario */}
                      <p style={{ fontSize: "0.8rem", color: "#64748b" }}>Consulta la hoja de ruta para detalles de costos y repuestos.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="mant-btn secondary" onClick={closeModal} style={{ marginRight: "10px" }}>Cerrar</button>
              {selected.estado_id < 14 && (
                <button className="mant-btn primary" onClick={avanzarEstado}>
                  {selected.estado_id === 1 ? "Iniciar Trabajo" : "Completar y Guardar en Hoja de Rutina"}
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

// Subcomponentes
function StatCard({ label, value }) {
  return (
    <div className="mant-stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function Column({ title, type, items, onCardClick }) {
  return (
    <div className="mant-column">
      <div className={`col-header ${type}`}>
        <h3>{title}</h3>
        <span className="count-badge">{items.length}</span>
      </div>
      <div className="mant-list-area">
        {items.map(s => (
          <ProfessionalCard key={s.id} data={s} onClick={() => onCardClick(s)} />
        ))}
        {items.length === 0 && (
          <div className="empty-state">
             <div className="empty-state-icon">📂</div>
             <p>Sin solicitudes</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfessionalCard({ data, onClick }) {
  const priorityClass = data.prioridad_id === 3 ? "priority-high" : data.prioridad_id === 2 ? "priority-medium" : "priority-low";
  
  // Extraer tags si existen [CATEGORIA - TIPO]
  const tagMatch = data.descripcion?.match(/^\[(.*?) - (.*?)\]/);
  const displayDesc = tagMatch ? data.descripcion.replace(tagMatch[0], "").trim() : data.descripcion;
  const categoryTag = tagMatch ? tagMatch[1] : null;
  const typeTag = tagMatch ? tagMatch[2] : null;

  return (
    <div className={`mant-card ${priorityClass}`} onClick={onClick}>
      <div className="card-top">
        <span className="card-tag tag-id">{data.consecutivo ? `M-${data.consecutivo}` : `#${data.id}`}</span>
        <span className="card-tag" style={{ background: "#f8fafc", color: "#64748b" }}>{data.prioridades?.nombre}</span>
      </div>
      
      {categoryTag && (
        <div style={{ display: "flex", gap: "5px", marginBottom: "8px" }}>
          <span className="card-tag" style={{ background: "var(--mant-bg)", color: "var(--mant-primary)", fontSize: "0.65rem" }}>
            {categoryTag}
          </span>
          <span className="card-tag" style={{ background: "white", border: "1px solid var(--mant-border)", color: "#475569", fontSize: "0.65rem" }}>
            {typeTag}
          </span>
        </div>
      )}

      <h4>{data.tipos_solicitud?.nombre}</h4>
      <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "5px 0", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {displayDesc}
      </p>

      <div className="card-info-item">👤 {data.area_solicitante}</div>
      {data.activos && (
        <div className="card-asset-tag">
          <span>⚙️ {data.activos.nombre}</span>
        </div>
      )}
      {data.proveedor && (
        <div className="card-info-item" style={{ marginTop: "8px", fontWeight: "600", color: "var(--mant-primary)" }}>
          🚚 {data.proveedor.nombre}
        </div>
      )}
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div className="info-item-box">
      <label>{label}</label>
      <span>{value || "---"}</span>
    </div>
  );
}
