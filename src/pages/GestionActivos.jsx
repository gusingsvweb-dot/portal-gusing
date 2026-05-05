import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, st } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./Mantenimiento.css";
import "./GestionActivos.css";

const TIPO_ICON = { Equipo: "⚙️", "Instalación": "🏗️", Computador: "💻" };

export default function GestionActivos() {
  const navigate = useNavigate();
  const [activos, setActivos] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAreaForm, setShowAreaForm] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [selectedActivo, setSelectedActivo] = useState(null);
  const [rutina, setRutina] = useState([]);
  const [rutinaLoading, setRutinaLoading] = useState(false);
  const [filtroText, setFiltroText] = useState("");
  const [filtroCrit, setFiltroCrit] = useState("todos");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    nombre: "", tipo: "Equipo", area_id: "", codigo: "", descripcion: "", criticidad: "Baja"
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: act }, { data: ars }] = await Promise.all([
      supabase.from(st("activos")).select("*").order("nombre"),
      supabase.from(st("areas")).select("*").order("nombre"),
    ]);
    setActivos(act || []);
    setAreas(ars || []);
    setLoading(false);
  }

  const stats = useMemo(() => ({
    total: activos.length,
    alta: activos.filter(a => a.criticidad === "Alta").length,
    media: activos.filter(a => a.criticidad === "Media").length,
    baja: activos.filter(a => a.criticidad === "Baja").length,
  }), [activos]);

  const filtered = useMemo(() => {
    let res = activos;
    if (filtroCrit !== "todos") res = res.filter(a => a.criticidad === filtroCrit);
    if (filtroText.trim()) {
      const q = filtroText.toLowerCase();
      res = res.filter(a =>
        a.nombre?.toLowerCase().includes(q) ||
        a.codigo?.toLowerCase().includes(q) ||
        areas.find(ar => ar.id === a.area_id)?.nombre?.toLowerCase().includes(q)
      );
    }
    return res;
  }, [activos, filtroCrit, filtroText, areas]);

  async function openEdit(a, e) {
    e.stopPropagation();
    setForm({ ...a });
    setShowForm(true);
  }

  async function saveActivo() {
    if (!form.nombre || !form.area_id) return alert("Nombre y Área son obligatorios");
    setSaving(true);
    const { error } = await supabase.from(st("activos")).upsert([form]);
    if (error) alert("Error: " + error.message);
    else {
      setShowForm(false);
      resetForm();
      loadData();
    }
    setSaving(false);
  }

  async function deleteActivo(id, e) {
    e.stopPropagation();
    if (!confirm("¿Eliminar este activo? Esta acción no se puede deshacer.")) return;
    const { error } = await supabase.from(st("activos")).delete().eq("id", id);
    if (error) alert("Error: " + error.message);
    else loadData();
  }

  async function deleteAllAssets() {
    const total = activos.length;
    if (total === 0) return alert("No hay activos para eliminar.");
    
    if (!confirm(`⚠️ ATENCIÓN: Estás a punto de eliminar los ${total} activos registrados.\n\nEsto también borrará todas sus órdenes de trabajo, solicitudes y planes preventivos asociados.\n\n¿Deseas continuar?`)) return;
    if (!confirm("🚨 ¿ESTÁS ABSOLUTAMENTE SEGURO? Esta acción es irreversible y borrará TODO el historial de estos activos.")) return;

    setLoading(true);
    try {
      // 1. Borrar planes preventivos
      await supabase.from(st("planes_preventivos")).delete().not("id", "is", null);
      
      // 2. Borrar solicitudes y órdenes
      await supabase.from(st("solicitudes")).delete().not("id", "is", null);
      
      // 3. Borrar finalmente los activos
      const { error } = await supabase.from(st("activos")).delete().not("id", "is", null);
      
      if (error) throw error;
      
      alert("Se han eliminado todos los activos y su historial correctamente.");
      loadData();
    } catch (err) {
      alert("Error al eliminar todo: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveNewArea() {
    if (!newAreaName.trim()) return;
    const { data, error } = await supabase.from(st("areas")).insert([{ nombre: newAreaName.trim() }]).select();
    if (error) { alert("Error al crear área: " + error.message); return; }
    const newAr = data[0];
    setNewAreaName("");
    setShowAreaForm(false);
    setAreas(prev => [...prev, newAr].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setForm(prev => ({ ...prev, area_id: newAr.id }));
  }

  async function loadRutina(activo) {
    setSelectedActivo(activo);
    setRutinaLoading(true);
    setRutina([]);
    const { data } = await supabase
      .from(st("solicitudes"))
      .select(`id, consecutivo, created_at, descripcion, accion_realizada, fecha_cierre, usuario_id, tipos_solicitud(nombre)`)
      .eq("activo_id", activo.id)
      .not("accion_realizada", "is", null)
      .order("fecha_cierre", { ascending: false });
    setRutina(data || []);
    setRutinaLoading(false);
  }

  function resetForm() {
    setForm({ nombre: "", tipo: "Equipo", area_id: "", codigo: "", descripcion: "", criticidad: "Baja" });
    setShowAreaForm(false);
    setNewAreaName("");
  }

  return (
    <>
      <Navbar />
      <div className="mant-container">
        <header className="mant-header-section">
          <div>
            <h2 className="mant-title">Gestión de Activos</h2>
            <p className="mant-subtitle">Inventario centralizado de infraestructura y equipos — {activos.length} activos registrados</p>
          </div>
          <div className="mant-actions-group">
            <button className="mant-btn-action secondary" onClick={() => navigate("/mantenimiento")}>← Tablero</button>
            <button className="mant-btn-action secondary" style={{ color: "#ef4444", borderColor: "#fecaca" }} onClick={deleteAllAssets}>🗑️ Borrar Todo</button>
            <button className="mant-btn-action secondary" onClick={() => navigate("/mantenimiento/importar-activos")}>📥 Importar Excel</button>
            <button className="mant-btn-action primary" onClick={() => { resetForm(); setShowForm(true); }}>+ Nuevo Activo</button>
          </div>
        </header>

        {/* STATS ROW */}
        <div className="activos-stats-row">
          <div className="activo-stat" onClick={() => setFiltroCrit("todos")} style={{ "--a": filtroCrit === "todos" ? "var(--mant-primary)" : "#94a3b8" }}>
            <span className="as-val">{stats.total}</span><span className="as-lbl">Total Activos</span>
          </div>
          <div className="activo-stat crit-alta" onClick={() => setFiltroCrit(filtroCrit === "Alta" ? "todos" : "Alta")} style={{ "--a": "#ef4444" }}>
            <span className="as-val">{stats.alta}</span><span className="as-lbl">Criticidad Alta</span>
          </div>
          <div className="activo-stat crit-media" onClick={() => setFiltroCrit(filtroCrit === "Media" ? "todos" : "Media")} style={{ "--a": "#f59e0b" }}>
            <span className="as-val">{stats.media}</span><span className="as-lbl">Criticidad Media</span>
          </div>
          <div className="activo-stat crit-baja" onClick={() => setFiltroCrit(filtroCrit === "Baja" ? "todos" : "Baja")} style={{ "--a": "#10b981" }}>
            <span className="as-val">{stats.baja}</span><span className="as-lbl">Criticidad Baja</span>
          </div>
        </div>

        {/* FILTER */}
        <div className="mant-filter-bar">
          <div className="mant-search-wrap">
            <span className="search-icon">🔍</span>
            <input className="mant-search-input" placeholder="Buscar por nombre, código, área..."
              value={filtroText} onChange={e => setFiltroText(e.target.value)} />
            {filtroText && <button className="search-clear" onClick={() => setFiltroText("")}>✖</button>}
          </div>
          {filtroCrit !== "todos" && (
            <span className={`v2-crit-badge crit-${filtroCrit.toLowerCase()}`} style={{ cursor: "pointer" }} onClick={() => setFiltroCrit("todos")}>
              {filtroCrit} ✖
            </span>
          )}
        </div>

        {loading ? (
          <div className="mant-loading-state">Actualizando inventario...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ marginTop: "60px" }}>
            <div className="empty-state-icon">🏭</div>
            <p>No se encontraron activos con ese filtro</p>
          </div>
        ) : (
          <div className="assets-grid-premium">
            {filtered.map(a => {
              const area = areas.find(ar => ar.id === a.area_id);
              return (
                <div key={a.id} className={`asset-card-v2 crit-${a.criticidad?.toLowerCase() || "baja"}`} onClick={() => loadRutina(a)}>
                  <div className="card-v2-header">
                    <span className="v2-id-tag">{a.codigo || `ID-${a.id}`}</span>
                    <div style={{ display: "flex", gap: "5px" }}>
                      <span className={`v2-crit-badge crit-${a.criticidad?.toLowerCase() || "baja"}`}>{a.criticidad || "Baja"}</span>
                      <span className="v2-type-badge">{a.tipo}</span>
                    </div>
                  </div>
                  <div className="card-v2-icon">{TIPO_ICON[a.tipo] || "🔩"}</div>
                  <h4>{a.nombre}</h4>
                  {a.descripcion && <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "0 0 10px", lineHeight: "1.5" }}>{a.descripcion}</p>}
                  <div className="v2-location-info">📍 {area?.nombre || "Sin área"}</div>
                  <div className="card-v2-footer">
                    <button className="mini-btn" onClick={e => { e.stopPropagation(); loadRutina(a); }}>📋 Historial</button>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="mini-btn" style={{ color: "var(--mant-primary)", borderColor: "#bfdbfe" }} onClick={e => openEdit(a, e)}>✏️ Editar</button>
                      <button className="mini-btn" style={{ color: "#ef4444", borderColor: "#fecaca" }} onClick={e => deleteActivo(a.id, e)}>🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FORM MODAL */}
        {showForm && (
          <div className="mant-modal-overlay-v2" onClick={() => { setShowForm(false); resetForm(); }}>
            <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <h3>{form.id ? "✏️ Editar Activo" : "✨ Nuevo Activo"}</h3>
                <button className="close-btn-v2" onClick={() => { setShowForm(false); resetForm(); }}>✖</button>
              </div>
              <div className="modal-v2-body">
                <div className="v2-form-group">
                  <label>Nombre del Activo <span className="req">*</span></label>
                  <input className="v2-input" type="text" value={form.nombre}
                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Ej: Aire Acondicionado Central 1" />
                </div>
                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Tipo</label>
                    <select className="v2-select" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                      <option value="Equipo">Maquinaria / Equipo</option>
                      <option value="Instalación">Instalación Civil</option>
                      <option value="Computador">Equipo de Cómputo</option>
                    </select>
                  </div>
                  <div className="v2-form-group">
                    <label>Criticidad <span className="req">*</span></label>
                    <select className="v2-select" value={form.criticidad} onChange={e => setForm({ ...form, criticidad: e.target.value })}>
                      <option value="Alta">Alta (Crítico GMP)</option>
                      <option value="Media">Media</option>
                      <option value="Baja">Baja</option>
                    </select>
                  </div>
                </div>
                <div className="v2-form-group">
                  <label>Área / Ubicación <span className="req">*</span></label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <select className="v2-select" value={form.area_id} onChange={e => setForm({ ...form, area_id: e.target.value })}>
                      <option value="">Seleccione área...</option>
                      {areas.map(ar => <option key={ar.id} value={ar.id}>{ar.nombre}</option>)}
                    </select>
                    <button className="v2-add-btn" title="Nueva área" onClick={() => setShowAreaForm(!showAreaForm)}>
                      {showAreaForm ? "✖" : "+"}
                    </button>
                  </div>
                  {showAreaForm && (
                    <div className="v2-inline-form">
                      <input className="v2-input-mini" placeholder="Nombre del área..." value={newAreaName}
                        onChange={e => setNewAreaName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveNewArea()} />
                      <button className="v2-save-mini" onClick={saveNewArea}>OK</button>
                    </div>
                  )}
                </div>
                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Código Interno / TAG</label>
                    <input className="v2-input" type="text" value={form.codigo}
                      onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="TAG-001" />
                  </div>
                </div>
                <div className="v2-form-group">
                  <label>Descripción / Observaciones</label>
                  <textarea className="v2-input" rows={3} value={form.descripcion}
                    onChange={e => setForm({ ...form, descripcion: e.target.value })}
                    placeholder="Características técnicas, ubicación exacta, notas importantes..." />
                </div>
              </div>
              <div className="modal-v2-footer">
                <button className="v2-btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</button>
                <button className="v2-btn-primary" onClick={saveActivo} disabled={saving}>
                  {saving ? "Guardando..." : form.id ? "Actualizar Activo" : "Registrar Activo"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RUTINA MODAL */}
        {selectedActivo && (
          <div className="mant-modal-overlay-v2" onClick={() => setSelectedActivo(null)}>
            <div className="mant-modal-content-centered wide-v2" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <div className="v2-header-title">
                  <span className="icon-v2-header">{TIPO_ICON[selectedActivo.tipo] || "🔩"}</span>
                  <div>
                    <h3>Hoja de Rutina</h3>
                    <p>{selectedActivo.nombre} | {selectedActivo.codigo || "Sin código"} |&nbsp;
                      <span className={`v2-crit-badge crit-${selectedActivo.criticidad?.toLowerCase() || "baja"}`}>
                        {selectedActivo.criticidad || "Baja"}
                      </span>
                    </p>
                  </div>
                </div>
                <button className="close-btn-v2" onClick={() => setSelectedActivo(null)}>✖</button>
              </div>
              <div className="scroll-v2">
                <h4 className="v2-subtitle">Historial de Intervenciones</h4>
                {rutinaLoading ? (
                  <div className="mant-loading-state">Cargando historial...</div>
                ) : rutina.length === 0 ? (
                  <div className="v2-empty-state">
                    <div className="v2-empty-icon">📭</div>
                    <p>Este activo aún no tiene intervenciones registradas.</p>
                  </div>
                ) : (
                  <div className="v2-timeline">
                    {rutina.map(item => (
                      <div key={item.id} className="v2-timeline-item">
                        <div className="v2-tl-marker"></div>
                        <div className="v2-tl-date">
                          <span className="v2-date-main">{new Date(item.fecha_cierre).toLocaleDateString("es-CO")}</span>
                          <span className="v2-date-sub">{new Date(item.fecha_cierre).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <div className="v2-tl-card">
                          <div className="v2-tl-header">
                            <span className="v2-tl-consec">M-{item.consecutivo}</span>
                            <span className="v2-tl-type">{item.tipos_solicitud?.nombre}</span>
                          </div>
                          <div className="v2-tl-body">
                            <p className="v2-tl-orig"><strong>Problema:</strong> {item.descripcion}</p>
                            <div className="v2-tl-action">
                              <strong>Acción realizada:</strong>
                              <p>{item.accion_realizada}</p>
                            </div>
                          </div>
                          <div className="v2-tl-footer">👨‍🔧 Responsable: {item.usuario_id}</div>
                        </div>
                      </div>
                    ))}
                  </div>
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
