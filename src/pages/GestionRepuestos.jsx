import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, st } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { notifyRoles } from "../api/notifications";
import GestionHerramientas from "./GestionHerramientas";
import "./Mantenimiento.css";
import "./GestionRepuestos.css";

export default function GestionRepuestos() {
  const navigate = useNavigate();
  const [repuestos, setRepuestos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState("repuestos");
  const [showModal, setShowModal] = useState(false);
  const [sortBy, setSortBy] = useState("nombre");
  const [filtroText, setFiltroText] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ nombre: "", stock: 0, costo: 0, unidad: "Unidad", stock_minimo: 5 });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from(st("repuestos")).select("*").order("nombre");
    const items = data || [];
    setRepuestos(items);
    setLoading(false);
    checkLowStockAndNotify(items);
  }

  // Envía notificación de bajo stock máximo una vez por día
  async function checkLowStockAndNotify(items) {
    const hoy = new Date().toISOString().split("T")[0];
    const lastKey = "lastLowStockNotif";
    if (localStorage.getItem(lastKey) === hoy) return; // ya notificó hoy

    const bajos = items.filter(r => r.stock <= (r.stock_minimo ?? 5));
    if (bajos.length === 0) return;

    const lista = bajos
      .map(r => `• ${r.nombre}: ${r.stock} ${r.unidad} (mín. ${r.stock_minimo ?? 5})`)
      .join("\n");

    await notifyRoles(
      ["mantenimiento", "gerencia"],
      `⚠️ Alerta de Bajo Stock — ${bajos.length} ítem${bajos.length !== 1 ? "s" : ""}`,
      `Los siguientes repuestos están por debajo del stock mínimo:\n${lista}`,
      null,
      "info"
    );
    localStorage.setItem(lastKey, hoy);
  }

  const isBajoStock = (r) => r.stock <= (r.stock_minimo ?? 5);

  const stats = useMemo(() => {
    const bajoStock = repuestos.filter(isBajoStock).length;
    const valorTotal = repuestos.reduce((sum, r) => sum + (parseFloat(r.costo || 0) * parseFloat(r.stock || 0)), 0);
    return { total: repuestos.length, bajoStock, valorTotal };
  }, [repuestos]);

  const displayList = useMemo(() => {
    let res = [...repuestos];
    if (filtroText.trim()) {
      const q = filtroText.toLowerCase();
      res = res.filter(r => r.nombre?.toLowerCase().includes(q) || r.unidad?.toLowerCase().includes(q));
    }
    if (sortBy === "stock_asc") res.sort((a, b) => a.stock - b.stock);
    else if (sortBy === "stock_desc") res.sort((a, b) => b.stock - a.stock);
    else if (sortBy === "costo_desc") res.sort((a, b) => b.costo - a.costo);
    else if (sortBy === "bajo_stock") res.sort(a => (isBajoStock(a) ? -1 : 1));
    else res.sort((a, b) => a.nombre?.localeCompare(b.nombre));
    return res;
  }, [repuestos, sortBy, filtroText]);

  async function saveRepuesto() {
    if (!form.nombre) return alert("Nombre es obligatorio");
    setSaving(true);
    const payload = {
      ...form,
      stock_minimo: parseInt(form.stock_minimo) || 5,
    };
    const { error } = await supabase.from(st("repuestos")).upsert([payload]);
    if (error) alert("Error: " + error.message);
    else { setShowModal(false); resetForm(); loadData(); }
    setSaving(false);
  }

  async function deleteRepuesto(id, e) {
    e.stopPropagation();
    if (!confirm("¿Eliminar este repuesto del inventario?")) return;
    const { error } = await supabase.from(st("repuestos")).delete().eq("id", id);
    if (error) alert("Error: " + error.message);
    else loadData();
  }

  function resetForm() { setForm({ nombre: "", stock: 0, costo: 0, unidad: "Unidad", stock_minimo: 5 }); }
  function openEdit(r) { setForm({ ...r, stock_minimo: r.stock_minimo ?? 5 }); setShowModal(true); }

  const stockPct = (r) => {
    const max = Math.max((r.stock_minimo ?? 5) * 4, 20, r.stock);
    return Math.min((r.stock / max) * 100, 100);
  };

  return (
    <>
      <Navbar />
      <div className="mant-container">
        <header className="mant-header-section">
          <div>
            <h2 className="mant-title">Gestión de Inventario</h2>
            <p className="mant-subtitle">
              {subView === "repuestos" 
                ? "Inventario de insumos y refacciones para mantenimiento industrial"
                : "Control de calibración, vigencia y estado operativo para herramientas del taller"}
            </p>
          </div>
          <div className="mant-actions-group">

            {subView === "repuestos" && (
              <button className="mant-btn-action primary" onClick={() => { resetForm(); setShowModal(true); }}>+ Nuevo Repuesto</button>
            )}
          </div>
        </header>

        {/* SUBTABS */}
        <div className="ge-sub-tabs">
          <button className={`ge-sub-tab${subView === "repuestos" ? " active" : ""}`} onClick={() => setSubView("repuestos")}>📦 Repuestos</button>
          <button className={`ge-sub-tab${subView === "herramientas" ? " active" : ""}`} onClick={() => setSubView("herramientas")}>🔧 Herramientas</button>
        </div>

        {subView === "herramientas" && <GestionHerramientas embedded />}

        {subView === "repuestos" && <>
        {/* STATS */}
        <div className="rep-stats-row">
          <div className="rep-stat-card" style={{ "--c": "#6366f1" }}>
            <span className="rep-stat-icon">📦</span>
            <div className="rep-stat-body">
              <span className="rep-stat-num">{stats.total}</span>
              <span className="rep-stat-lbl">Total Ítems</span>
            </div>
          </div>
          <div className="rep-stat-card" style={{ "--c": "#ef4444" }}>
            <span className="rep-stat-icon">⚠️</span>
            <div className="rep-stat-body">
              <span className="rep-stat-num">{stats.bajoStock}</span>
              <span className="rep-stat-lbl">Bajo Stock (por debajo del mínimo)</span>
            </div>
          </div>
          <div className="rep-stat-card" style={{ "--c": "#10b981" }}>
            <span className="rep-stat-icon">💰</span>
            <div className="rep-stat-body">
              <span className="rep-stat-num">${stats.valorTotal.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</span>
              <span className="rep-stat-lbl">Valor en Inventario</span>
            </div>
          </div>
        </div>

        {/* FILTERS */}
        <div className="mant-filter-bar" style={{ marginBottom: "24px" }}>
          <div className="mant-search-wrap">
            <span className="search-icon">🔍</span>
            <input className="mant-search-input" placeholder="Buscar repuesto..."
              value={filtroText} onChange={e => setFiltroText(e.target.value)} />
            {filtroText && <button className="search-clear" onClick={() => setFiltroText("")}>✖</button>}
          </div>
          <select className="v2-select" style={{ width: "220px" }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="nombre">Ordenar: A-Z</option>
            <option value="bajo_stock">Primero: Bajo Stock</option>
            <option value="stock_asc">Stock: Menor primero</option>
            <option value="stock_desc">Stock: Mayor primero</option>
            <option value="costo_desc">Costo: Mayor primero</option>
          </select>
        </div>

        {loading ? (
          <div className="mant-loading-state">Actualizando inventario...</div>
        ) : displayList.length === 0 ? (
          <div className="empty-state" style={{ marginTop: "60px" }}>
            <div className="empty-state-icon">⚙️</div>
            <p>No se encontraron repuestos</p>
          </div>
        ) : (
          <div className="rep-grid">
            {displayList.map(r => {
              const bajo = isBajoStock(r);
              const minimo = r.stock_minimo ?? 5;
              const pct = stockPct(r);
              const valorItem = parseFloat(r.costo || 0) * parseFloat(r.stock || 0);
              return (
                <div key={r.id} className={`rep-card ${bajo ? "rep-card-bajo" : ""}`} onClick={() => openEdit(r)}>
                  <div className="rep-card-header">
                    <span className="v2-id-tag">REP-{r.id}</span>
                    {bajo && <span className="rep-bajo-badge">⚠️ BAJO STOCK</span>}
                  </div>

                  <h4 className="rep-card-name">{r.nombre}</h4>

                  {/* Barra de stock con indicador de mínimo */}
                  <div className="rep-stock-bar-wrap" title={`Stock: ${r.stock} / Mínimo: ${minimo}`}>
                    <div className="rep-stock-bar" style={{ "--pct": `${pct}%`, "--col": bajo ? "#ef4444" : "#10b981" }}></div>
                    <div className="rep-stock-min-marker" style={{ "--minpct": `${Math.min((minimo / Math.max(minimo * 4, 20, r.stock)) * 100, 100)}%` }} title={`Mínimo: ${minimo}`}></div>
                  </div>

                  <div className="rep-metrics">
                    <div className="rep-metric">
                      <span className="rep-metric-lbl">Stock</span>
                      <span className={`rep-metric-val ${bajo ? "val-bajo" : ""}`}>{r.stock} {r.unidad}</span>
                    </div>
                    <div className="rep-metric">
                      <span className="rep-metric-lbl">Mínimo</span>
                      <span className="rep-metric-val rep-minimo-val">{minimo} {r.unidad}</span>
                    </div>
                    <div className="rep-metric">
                      <span className="rep-metric-lbl">Costo unit.</span>
                      <span className="rep-metric-val">${parseFloat(r.costo || 0).toLocaleString()}</span>
                    </div>
                    <div className="rep-metric">
                      <span className="rep-metric-lbl">Valor total</span>
                      <span className="rep-metric-val">${valorItem.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>

                  <div className="rep-card-footer">
                    <button className="mini-btn" style={{ color: "var(--mant-primary)", borderColor: "#bfdbfe" }}
                      onClick={e => { e.stopPropagation(); openEdit(r); }}>✏️ Editar</button>
                    <button className="mini-btn" style={{ color: "#ef4444", borderColor: "#fecaca" }}
                      onClick={e => deleteRepuesto(r.id, e)}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MODAL */}
        {showModal && (
          <div className="mant-modal-overlay-v2" onClick={() => { setShowModal(false); resetForm(); }}>
            <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <h3>{form.id ? "✏️ Editar Repuesto" : "📦 Nuevo Repuesto"}</h3>
                <button className="close-btn-v2" onClick={() => { setShowModal(false); resetForm(); }}>✖</button>
              </div>
              <div className="modal-v2-body">
                <div className="v2-form-group">
                  <label>Nombre del Insumo / Repuesto <span className="req">*</span></label>
                  <input className="v2-input" value={form.nombre}
                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Ej: Filtro de aire HEPA 24x24" />
                </div>
                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Stock Actual</label>
                    <input type="number" min="0" step="0.01" className="v2-input" value={form.stock}
                      onChange={e => setForm({ ...form, stock: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="v2-form-group">
                    <label>Unidad de Medida</label>
                    <select className="v2-select" value={form.unidad} onChange={e => setForm({ ...form, unidad: e.target.value })}>
                      <option value="Unidad">Unidad</option>
                      <option value="Litros">Litros</option>
                      <option value="Metros">Metros</option>
                      <option value="Galones">Galones</option>
                      <option value="Kg">Kilogramos</option>
                      <option value="Rollos">Rollos</option>
                    </select>
                  </div>
                </div>

                {/* Alerta de bajo stock configurable */}
                <div className="v2-form-group">
                  <label className="rep-minimo-label">
                    <span>🔔 Alerta de Bajo Stock (Stock Mínimo)</span>
                    <span className="rep-minimo-hint">Se notificará cuando el stock sea igual o menor a este valor</span>
                  </label>
                  <div className="rep-minimo-input-wrap">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="v2-input"
                      value={form.stock_minimo}
                      onChange={e => setForm({ ...form, stock_minimo: parseInt(e.target.value) || 0 })}
                    />
                    <span className="rep-minimo-unit">{form.unidad}</span>
                    {form.stock > 0 && (
                      <span className={`rep-minimo-preview ${form.stock <= form.stock_minimo ? "preview-bajo" : "preview-ok"}`}>
                        {form.stock <= form.stock_minimo ? "⚠️ Bajo stock actual" : "✓ Stock OK"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="v2-form-group">
                  <label>Costo Unitario ($)</label>
                  <input type="number" min="0" step="0.01" className="v2-input" value={form.costo}
                    onChange={e => setForm({ ...form, costo: parseFloat(e.target.value) || 0 })} />
                </div>
                {form.stock > 0 && form.costo > 0 && (
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "12px 16px", fontSize: "0.875rem", color: "#15803d" }}>
                    💰 Valor en inventario: <strong>${(form.stock * form.costo).toLocaleString("es-CO", { maximumFractionDigits: 0 })}</strong>
                  </div>
                )}
              </div>
              <div className="modal-v2-footer">
                <button className="v2-btn-secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancelar</button>
                <button className="v2-btn-primary" onClick={saveRepuesto} disabled={saving}>
                  {saving ? "Guardando..." : form.id ? "Actualizar" : "Guardar Insumo"}
                </button>
              </div>
            </div>
          </div>
        )}
        </>}
      </div>
      <Footer />
    </>
  );
}
