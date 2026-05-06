import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, st } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./Mantenimiento.css";

export default function GestionProveedoresMant() {
  const navigate = useNavigate();
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filtroText, setFiltroText] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [selectedProv, setSelectedProv] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showCustomEsp, setShowCustomEsp] = useState(false);
  const [customEsp, setCustomEsp] = useState("");

  const [form, setForm] = useState({
    nombre: "", especialidad: "", contacto: "", telefono: "", email: ""
  });

  useEffect(() => { loadProveedores(); }, []);

  async function loadProveedores() {
    setLoading(true);
    const { data } = await supabase.from(st("proveedores_mant")).select("*").order("nombre");
    setProveedores(data || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!filtroText.trim()) return proveedores;
    const q = filtroText.toLowerCase();
    return proveedores.filter(p =>
      p.nombre?.toLowerCase().includes(q) ||
      p.especialidad?.toLowerCase().includes(q) ||
      p.contacto?.toLowerCase().includes(q)
    );
  }, [proveedores, filtroText]);

  async function saveProveedor() {
    if (!form.nombre) return alert("El nombre es obligatorio");
    setSaving(true);
    const { error } = await supabase.from(st("proveedores_mant")).upsert([form]);
    if (error) alert("Error: " + error.message);
    else { setShowForm(false); resetForm(); loadProveedores(); }
    setSaving(false);
  }

  async function deleteProveedor(id, e) {
    e.stopPropagation();
    if (!confirm("¿Eliminar este proveedor? Esta acción no se puede deshacer.")) return;
    const { error } = await supabase.from(st("proveedores_mant")).delete().eq("id", id);
    if (error) alert("Error: " + error.message);
    else loadProveedores();
  }

  function resetForm() {
    setForm({ nombre: "", especialidad: "", contacto: "", telefono: "", email: "" });
  }

  function openEdit(p) { setForm({ ...p }); setShowForm(true); setShowCustomEsp(false); }

  async function openHistory(p, e) {
    e.stopPropagation();
    setSelectedProv(p);
    setShowHistory(true);
    setHistoryLoading(true);
    const { data } = await supabase
      .from(st("solicitudes"))
      .select(`id, consecutivo, descripcion, fecha_cierre, activos(nombre)`)
      .eq("proveedor_id", p.id)
      .not("fecha_cierre", "is", null)
      .order("fecha_cierre", { ascending: false });
    setHistory(data || []);
    setHistoryLoading(false);
  }

  const ESPECIALIDAD_COLOR = {
    "Eléctrico": { bg: "#eff6ff", color: "#2563eb" },
    "Refrigeración": { bg: "#f0fdfa", color: "#0f766e" },
    "Mecánico": { bg: "#faf5ff", color: "#7c3aed" },
    "HVAC": { bg: "#fff7ed", color: "#c2410c" },
    "Instrumentación": { bg: "#fdf4ff", color: "#a21caf" },
    "General": { bg: "#f8fafc", color: "#475569" },
  };

  function getEspColor(esp) {
    return ESPECIALIDAD_COLOR[esp] || { bg: "#f8fafc", color: "#475569" };
  }

  return (
    <>
      <Navbar />
      <div className="mant-container">
        <header className="mant-header-section">
          <div>
            <h2 className="mant-title">Proveedores de Mantenimiento</h2>
            <p className="mant-subtitle">Directorio de técnicos y servicios externos — {proveedores.length} registrados</p>
          </div>
          <div className="mant-actions-group">
            <button className="mant-btn-action secondary" onClick={() => navigate("/mantenimiento")}>← Tablero</button>
            <button className="mant-btn-action primary" onClick={() => { resetForm(); setShowForm(true); }}>+ Nuevo Proveedor</button>
          </div>
        </header>

        {/* SEARCH */}
        <div className="mant-filter-bar" style={{ marginBottom: "28px" }}>
          <div className="mant-search-wrap">
            <span className="search-icon">🔍</span>
            <input className="mant-search-input" placeholder="Buscar por nombre, especialidad, contacto..."
              value={filtroText} onChange={e => setFiltroText(e.target.value)} />
            {filtroText && <button className="search-clear" onClick={() => setFiltroText("")}>✖</button>}
          </div>
          {filtroText && <span className="filter-count">{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>}
        </div>

        {loading ? (
          <div className="mant-loading-state">Cargando directorio...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ marginTop: "60px" }}>
            <div className="empty-state-icon">👷</div>
            <p>No se encontraron proveedores</p>
          </div>
        ) : (
          <div className="assets-grid-premium">
            {filtered.map(p => {
              const espColor = getEspColor(p.especialidad);
              return (
                <div key={p.id} className="asset-card-v2" onClick={() => openEdit(p)}>
                  <div className="card-v2-header">
                    <span className="v2-id-tag">PROV-{p.id}</span>
                    <span className="v2-type-badge" style={{ background: espColor.bg, color: espColor.color }}>
                      {p.especialidad || "General"}
                    </span>
                  </div>
                  <div className="card-v2-icon">👷</div>
                  <h4>{p.nombre}</h4>
                  {p.contacto && <div className="v2-location-info">👤 {p.contacto}</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.82rem", color: "#64748b", marginBottom: "12px" }}>
                    {p.telefono && <span>📞 {p.telefono}</span>}
                    {p.email && (
                      <a href={`mailto:${p.email}`} style={{ color: "var(--mant-primary)" }} onClick={e => e.stopPropagation()}>
                        📧 {p.email}
                      </a>
                    )}
                  </div>
                  <div className="card-v2-footer">
                    <button className="mini-btn" style={{ color: "#10b981", borderColor: "#d1fae5" }}
                      onClick={e => openHistory(p, e)}>📋 Historial</button>
                    <button className="mini-btn" style={{ color: "var(--mant-primary)", borderColor: "#bfdbfe" }}
                      onClick={e => { e.stopPropagation(); openEdit(p); }}>✏️ Editar</button>
                    <button className="mini-btn" style={{ color: "#ef4444", borderColor: "#fecaca" }}
                      onClick={e => deleteProveedor(p.id, e)}>🗑️ Eliminar</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MODAL */}
        {showForm && (
          <div className="mant-modal-overlay-v2" onClick={() => { setShowForm(false); resetForm(); }}>
            <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <h3>{form.id ? "✏️ Editar Proveedor" : "👷 Nuevo Proveedor"}</h3>
                <button className="close-btn-v2" onClick={() => { setShowForm(false); resetForm(); }}>✖</button>
              </div>
              <div className="modal-v2-body">
                <div className="v2-form-group">
                  <label>Nombre de la Empresa / Técnico <span className="req">*</span></label>
                  <input className="v2-input" type="text" value={form.nombre}
                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Ej: Técnicos Unidos S.A.S" />
                </div>
                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Especialidad</label>
                    <select className="v2-select" value={showCustomEsp ? "CUSTOM" : form.especialidad}
                      onChange={e => {
                        if (e.target.value === "CUSTOM") setShowCustomEsp(true);
                        else { setShowCustomEsp(false); setForm({ ...form, especialidad: e.target.value }); }
                      }}>
                      <option value="">Seleccione...</option>
                      <option>Eléctrico</option>
                      <option>Refrigeración</option>
                      <option>Mecánico</option>
                      <option>HVAC</option>
                      <option>Instrumentación</option>
                      <option>Plomería</option>
                      <option>Cómputo / TI</option>
                      <option>General</option>
                      <option value="CUSTOM">+ Añadir especialidad...</option>
                    </select>
                    {showCustomEsp && (
                      <div className="v2-inline-form" style={{ marginTop: "8px" }}>
                        <input className="v2-input-mini" placeholder="Nombre especialidad..." 
                          value={customEsp} onChange={e => setCustomEsp(e.target.value)} />
                        <button className="v2-save-mini" onClick={() => { setForm({...form, especialidad: customEsp}); setShowCustomEsp(false); }}>OK</button>
                      </div>
                    )}
                  </div>
                  <div className="v2-form-group">
                    <label>Persona de Contacto</label>
                    <input className="v2-input" type="text" value={form.contacto}
                      onChange={e => setForm({ ...form, contacto: e.target.value })}
                      placeholder="Nombre del encargado" />
                  </div>
                </div>
                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Teléfono</label>
                    <input className="v2-input" type="tel" value={form.telefono}
                      onChange={e => setForm({ ...form, telefono: e.target.value })}
                      placeholder="+57 300 000 0000" />
                  </div>
                  <div className="v2-form-group">
                    <label>Email</label>
                    <input className="v2-input" type="email" value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      placeholder="contacto@empresa.com" />
                  </div>
                </div>
              </div>
              <div className="modal-v2-footer">
                {form.id && (
                  <button className="v2-btn-danger" onClick={e => deleteProveedor(form.id, e)}>
                    Eliminar
                  </button>
                )}
                <button className="v2-btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</button>
                <button className="v2-btn-primary" onClick={saveProveedor} disabled={saving}>
                  {saving ? "Guardando..." : form.id ? "Actualizar" : "Guardar Proveedor"}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* HISTORY MODAL */}
        {showHistory && (
          <div className="mant-modal-overlay-v2" onClick={() => setShowHistory(false)}>
            <div className="mant-modal-content-centered wide-v2" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <h3>📜 Historial: {selectedProv?.nombre}</h3>
                <button className="close-btn-v2" onClick={() => setShowHistory(false)}>✖</button>
              </div>
              <div className="modal-v2-body scroll-v2" style={{ maxHeight: "70vh" }}>
                {historyLoading ? <p>Cargando historial...</p> : 
                 history.length === 0 ? <p>No hay intervenciones registradas para este proveedor.</p> : (
                  <table className="anual-table">
                    <thead>
                      <tr><th>Fecha</th><th>OT</th><th>Equipo</th><th>Descripción</th></tr>
                    </thead>
                    <tbody>
                      {history.map(h => (
                        <tr key={h.id}>
                          <td>{new Date(h.fecha_cierre).toLocaleDateString()}</td>
                          <td>M-{h.consecutivo}</td>
                          <td>{h.activos?.nombre}</td>
                          <td style={{ fontSize: "0.85rem" }}>{h.descripcion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
