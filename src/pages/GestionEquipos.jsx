import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { supabase, st, ss } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./Mantenimiento.css";
import "./GestionEquipos.css";

const TIPO_ICON = { Equipo: "⚙️", "Instalación": "🏗️", Computador: "💻" };

export default function GestionEquipos() {
  const navigate = useNavigate();
  const [activos, setEquipos] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAreaForm, setShowAreaForm] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [selectedEquipo, setSelectedEquipo] = useState(null);
  const [rutina, setRutina] = useState([]);
  const [rutinaLoading, setRutinaLoading] = useState(false);
  const [filtroText, setFiltroText] = useState("");
  const [filtroCrit, setFiltroCrit] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [saving, setSaving] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  const [tiposSolicitud, setTiposSolicitud] = useState([]);

  const [form, setForm] = useState({
    nombre: "", tipo: "Equipo", area_id: "", codigo: "", descripcion: "", criticidad: "Baja", manual_url: ""
  });
  const [file, setFile] = useState(null);
  const [showManualInt, setShowManualInt] = useState(false);
  const [manualIntForm, setManualIntForm] = useState({ 
    fecha: new Date().toISOString().split("T")[0], 
    descripcion: "", 
    accion: "", 
    tecnico: "",
    tipo_solicitud_id: 5 // Preventivo por defecto
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: act }, { data: ars }, { data: provs }, { data: types }] = await Promise.all([
      supabase.from(st("activos")).select("*").order("nombre"),
      supabase.from(st("areas")).select("*").order("nombre"),
      supabase.from(st("proveedores_mant")).select("*").order("nombre"),
      supabase.from(st("tipos_solicitud")).select("*")
    ]);
    
    // Filter out tools from standard equipment list
    const toolTypes = ["Herramienta", "Herramienta Manual", "Herramienta Eléctrica", "Equipo de Medición", "Equipo de Seguridad"];
    const nonTools = (act || []).filter(a => 
      !toolTypes.includes(a.tipo) && 
      !a.tipo?.toLowerCase().includes("herramienta") && 
      !a.tipo?.toLowerCase().includes("medicion") && 
      !a.tipo?.toLowerCase().includes("medición") && 
      !a.tipo?.toLowerCase().includes("seguridad")
    );

    setEquipos(nonTools || []);
    setAreas(ars || []);
    setProveedores(provs || []);
    setTiposSolicitud(types || []);
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
    if (filtroTipo !== "todos") res = res.filter(a => a.tipo === filtroTipo);
    if (filtroText.trim()) {
      const q = filtroText.toLowerCase();
      res = res.filter(a =>
        a.nombre?.toLowerCase().includes(q) ||
        a.codigo?.toLowerCase().includes(q) ||
        areas.find(ar => ar.id === a.area_id)?.nombre?.toLowerCase().includes(q)
      );
    }
    return res;
  }, [activos, filtroCrit, filtroTipo, filtroText, areas]);

  async function openEdit(a, e) {
    e.stopPropagation();
    setForm({ ...a });
    setShowForm(true);
  }

  async function saveEquipo() {
    if (!form.nombre || !form.area_id) return alert("Nombre y Área son obligatorios");
    setSaving(true);
    
    let currentUrl = form.manual_url;
    if (file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `manuales/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('manuales_equipos')
        .upload(filePath, file);

      if (uploadError) {
        alert("Error subiendo manual: " + uploadError.message);
      } else {
        const { data: urlData } = supabase.storage
          .from('manuales_equipos')
          .getPublicUrl(filePath);
        currentUrl = urlData.publicUrl;
      }
    }

    const { error } = await supabase.from(st("activos")).upsert([{ ...form, manual_url: currentUrl }]);
    if (error) alert("Error: " + error.message);
    else {
      setShowForm(false);
      resetForm();
      loadData();
    }
    setSaving(false);
  }

  async function saveManualIntervention() {
    if (!manualIntForm.descripcion || !manualIntForm.accion) return alert("Completa descripción y acción");
    setSaving(true);
    
    // Consecutivo manual (para no chocar con las automáticas)
    const { data: maxData } = await supabase
      .from(st("solicitudes"))
      .select("consecutivo")
      .eq("area_id", 1)
      .order("consecutivo", { ascending: false })
      .limit(1);
    
    const nextConsecutivo = (maxData?.[0]?.consecutivo || 0) + 1;

    const { error } = await supabase.from(st("solicitudes")).insert([{
      activo_id: selectedEquipo.id,
      tipo_solicitud_id: parseInt(manualIntForm.tipo_solicitud_id) || 2,
      descripcion: `(MANUAL) ${manualIntForm.descripcion}`,
      accion_realizada: manualIntForm.accion,
      usuario_id: manualIntForm.tecnico || "TÉCNICO EXTERNO",
      estado_id: 15, // Cerrado
      area_id: 1,
      consecutivo: nextConsecutivo,
      fecha_cierre: new Date(manualIntForm.fecha).toISOString(),
      created_at: new Date(manualIntForm.fecha).toISOString(),
      area_solicitante: "MANTENIMIENTO"
    }]);

    if (error) alert("Error: " + error.message);
    else {
      setShowManualInt(false);
      setManualIntForm({ fecha: new Date().toISOString().split("T")[0], descripcion: "", accion: "", tecnico: "" });
      loadRutina(selectedEquipo);
    }
    setSaving(false);
  }

  async function deleteEquipo(id, e) {
    e.stopPropagation();
    if (!confirm("¿Eliminar este activo? Esta acción no se puede deshacer.")) return;
    const { error } = await supabase.from(st("activos")).delete().eq("id", id);
    if (error) {
      alert("Error: " + error.message);
    } else {
      setShowForm(false);
      resetForm();
      loadData();
    }
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
    setSelectedEquipo(activo);
    setRutinaLoading(true);
    setRutina([]);
    const { data } = await supabase
      .from(st("solicitudes"))
      .select(ss(`id, consecutivo, created_at, descripcion, accion_realizada, fecha_cierre, usuario_id, prioridad_id, tipos_solicitud(nombre)`))
      .eq("activo_id", activo.id)
      .in("estado_id", [13, 14, 15])
      .order("created_at", { ascending: false });
    setRutina(data || []);
    setRutinaLoading(false);
  }

  function printHojaRutina() {
    if (!selectedEquipo) return;
    const printWindow = window.open("", "_blank");
    const html = `
      <html>
        <head>
          <title>Hoja de Rutina - ${selectedEquipo.nombre}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 30px; background: #f9f9f9; padding: 15px; border-radius: 8px; }
            .info-item { font-size: 14px; }
            .info-item strong { color: #555; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f2f2f2; text-align: left; padding: 12px; border: 1px solid #ddd; font-size: 13px; }
            td { padding: 12px; border: 1px solid #ddd; font-size: 13px; vertical-align: top; }
            .footer { margin-top: 50px; font-size: 12px; color: #777; text-align: center; border-top: 1px solid #ddd; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">HOJA DE RUTINA Y MANTENIMIENTO</div>
            <div style="text-align: right">
              <div>Código: ${selectedEquipo.codigo || "N/A"}</div>
              <div>Fecha: ${new Date().toLocaleDateString()}</div>
            </div>
          </div>
          <div class="info-grid">
            <div class="info-item"><strong>EQUIPO:</strong> ${selectedEquipo.nombre}</div>
            <div class="info-item"><strong>TIPO:</strong> ${selectedEquipo.tipo}</div>
            <div class="info-item"><strong>UBICACIÓN:</strong> ${areas.find(a => a.id === selectedEquipo.area_id)?.nombre || "N/A"}</div>
            <div class="info-item"><strong>CRITICIDAD:</strong> ${selectedEquipo.criticidad}</div>
          </div>
          <h3>HISTORIAL DE INTERVENCIONES</h3>
          <table>
            <thead>
              <tr>
                <th>FECHA</th>
                <th>OT</th>
                <th>TIPO</th>
                <th>DESCRIPCIÓN / PROBLEMA</th>
                <th>ACCIÓN REALIZADA</th>
                <th>RESPONSABLE</th>
              </tr>
            </thead>
            <tbody>
              ${rutina.map(r => `
                <tr>
                  <td>${new Date(r.fecha_cierre).toLocaleDateString()}</td>
                  <td>M-${r.consecutivo}</td>
                  <td>${r.tipos_solicitud?.nombre}</td>
                  <td>${r.descripcion}</td>
                  <td>${r.accion_realizada}</td>
                  <td>${r.usuario_id}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <div class="footer">Documento generado automáticamente por Sistema de Gestión de Mantenimiento GMP</div>
          <script>window.print(); setTimeout(() => window.close(), 500);</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  }

  function resetForm() {
    setForm({ nombre: "", tipo: "Equipo", area_id: "", codigo: "", descripcion: "", criticidad: "Baja", manual_url: "" });
    setFile(null);
    setShowAreaForm(false);
    setNewAreaName("");
  }

  return (
    <>
      <Navbar />
      <div className="mant-container">
        <header className="mant-header-section">
          <div>
            <h2 className="mant-title">Gestión de Activos Fijos</h2>
            <p className="mant-subtitle">
              Inventario centralizado de infraestructura y equipos — {activos.length} equipos registrados
            </p>
          </div>
          <div className="mant-actions-group">

            <button className="mant-btn-action secondary" onClick={() => navigate("/mantenimiento/importar-activos")}>📥 Importar Excel</button>
            <button className="mant-btn-action primary" onClick={() => { resetForm(); setShowForm(true); }}>+ Nuevo Equipo</button>
          </div>
        </header>


        {/* STATS ROW */}
        <div className="activos-stats-row">
          <div className="activo-stat" onClick={() => setFiltroCrit("todos")} style={{ "--a": filtroCrit === "todos" ? "var(--mant-primary)" : "#94a3b8" }}>
            <span className="as-val">{stats.total}</span><span className="as-lbl">Total Equipos</span>
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
          
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button className={`nav-pill ${filtroTipo === "Instalación" ? "active" : ""}`} onClick={() => setFiltroTipo(filtroTipo === "Instalación" ? "todos" : "Instalación")}>Instalaciones</button>
            <button className={`nav-pill ${filtroTipo === "Equipo" ? "active" : ""}`} onClick={() => setFiltroTipo(filtroTipo === "Equipo" ? "todos" : "Equipo")}>Equipos</button>
            <button className={`nav-pill ${filtroTipo === "Computador" ? "active" : ""}`} onClick={() => setFiltroTipo(filtroTipo === "Computador" ? "todos" : "Computador")}>Cómputo</button>
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
            <p>No se encontraron equipos con ese filtro</p>
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
                      <button className="mini-btn" style={{ color: "#ef4444", borderColor: "#fecaca" }} onClick={e => deleteEquipo(a.id, e)}>🗑️</button>
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
                <h3>{form.id ? "✏️ Editar Equipo" : "✨ Nuevo Equipo"}</h3>
                <button className="close-btn-v2" onClick={() => { setShowForm(false); resetForm(); }}>✖</button>
              </div>
              <div className="modal-v2-body">
                <div className="v2-form-group">
                  <label>Nombre del Equipo <span className="req">*</span></label>
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
                    <label>Manual / Hoja de Rutina (PDF)</label>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <input className="v2-input" type="file" accept=".pdf" onChange={e => setFile(e.target.files[0])} />
                      {form.manual_url && (
                        <a href={form.manual_url} target="_blank" rel="noreferrer" className="v2-btn-secondary" style={{ textDecoration: "none", fontSize: "0.75rem", padding: "8px" }}>
                          📄 Ver Actual
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="v2-form-group">
                    <label>Descripción / Observaciones</label>
                    <textarea className="v2-input" rows={2} value={form.descripcion}
                      onChange={e => setForm({ ...form, descripcion: e.target.value })}
                      placeholder="Características técnicas, ubicación exacta, notas importantes..." />
                  </div>
              </div>
              <div className="modal-v2-footer">
                {form.id && (
                  <button 
                    className="v2-btn-secondary" 
                    style={{ color: "#ef4444", borderColor: "#fecaca", marginRight: "auto" }} 
                    onClick={(e) => deleteEquipo(form.id, e)}
                  >
                    🗑️ Eliminar
                  </button>
                )}
                <button className="v2-btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</button>
                <button className="v2-btn-primary" onClick={saveEquipo} disabled={saving}>
                  {saving ? "Guardando..." : form.id ? "Actualizar Equipo" : "Registrar Equipo"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RUTINA MODAL */}
        {selectedEquipo && (
          <div className="mant-modal-overlay-v2" onClick={() => setSelectedEquipo(null)}>
            <div className="mant-modal-content-centered wide-v2" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <div className="v2-header-title">
                  <span className="icon-v2-header">{TIPO_ICON[selectedEquipo.tipo] || "🔩"}</span>
                  <div>
                    <h3>Hoja de Rutina</h3>
                    <p>{selectedEquipo.nombre} | {selectedEquipo.codigo || "Sin código"} |&nbsp;
                      <span className={`v2-crit-badge crit-${selectedEquipo.criticidad?.toLowerCase() || "baja"}`}>
                        {selectedEquipo.criticidad || "Baja"}
                      </span>
                    </p>
                  </div>
                </div>
                 <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                   {selectedEquipo.manual_url && (
                     <a href={selectedEquipo.manual_url} target="_blank" rel="noreferrer" className="v2-btn-secondary" style={{ textDecoration: "none", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "5px" }}>
                       📄 Ver Manual
                     </a>
                   )}
                   <button className="v2-btn-primary" style={{ padding: "8px 16px", fontSize: "0.85rem" }} onClick={printHojaRutina}>
                     🖨️ Generar PDF / Imprimir
                   </button>
                   <button className="close-btn-v2" onClick={() => setSelectedEquipo(null)}>✖</button>
                 </div>
              </div>
              <div className="scroll-v2">
                 {rutinaLoading ? (
                   <div className="mant-loading-state">Cargando historial...</div>
                 ) : (
                   <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                      <h4 className="v2-subtitle" style={{ margin: 0 }}>Historial de Intervenciones</h4>
                      <button className="v2-btn-primary" style={{ fontSize: "0.75rem", padding: "6px 12px" }} onClick={() => setShowManualInt(true)}>
                        + Añadir Intervención Manual
                      </button>
                    </div>

                    {showManualInt && (
                      <div className="v2-inline-manual-form" style={{ background: "#f8fafc", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                          <strong>Nueva Intervención Manual</strong>
                          <button className="close-btn-v2" onClick={() => setShowManualInt(false)}>✖</button>
                        </div>
                        <div className="v2-form-row">
                          <div className="v2-form-group">
                            <label>Fecha</label>
                            <input type="date" className="v2-input" value={manualIntForm.fecha} onChange={e => setManualIntForm({...manualIntForm, fecha: e.target.value})} />
                          </div>
                          <div className="v2-form-group">
                            <label>Técnico / Proveedor Responsable</label>
                            <select className="v2-select" value={manualIntForm.tecnico} onChange={e => setManualIntForm({...manualIntForm, tecnico: e.target.value})}>
                              <option value="">Seleccione...</option>
                              <optgroup label="👨‍🔧 Técnicos Internos">
                                {proveedores.filter(p => p.tipo === "Interno").map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                              </optgroup>
                              <optgroup label="🚚 Proveedores Externos">
                                {proveedores.filter(p => p.tipo !== "Interno").map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                              </optgroup>
                            </select>
                          </div>
                          <div className="v2-form-group">
                            <label>Tipo de Intervención</label>
                            <select 
                              className="v2-select" 
                              value={manualIntForm.tipo_solicitud_id} 
                              onChange={e => setManualIntForm({...manualIntForm, tipo_solicitud_id: e.target.value})}
                            >
                              {tiposSolicitud.filter(t => [2, 5, 6].includes(t.id) || t.nombre.toLowerCase().includes("mejora")).map(t => (
                                <option key={t.id} value={t.id}>{t.nombre}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="v2-form-group">
                          <label>Descripción del Problema</label>
                          <input type="text" className="v2-input" value={manualIntForm.descripcion} onChange={e => setManualIntForm({...manualIntForm, descripcion: e.target.value})} />
                        </div>
                        <div className="v2-form-group">
                          <label>Acción Realizada</label>
                          <textarea className="v2-input" rows={2} value={manualIntForm.accion} onChange={e => setManualIntForm({...manualIntForm, accion: e.target.value})} />
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <button className="v2-btn-primary" onClick={saveManualIntervention} disabled={saving}>
                            {saving ? "Guardando..." : "Registrar en Historial"}
                          </button>
                        </div>
                      </div>
                    )}

                    {rutina.length === 0 ? (
                      <div className="v2-empty-state">
                        <div className="v2-empty-icon">📭</div>
                        <p>Este equipo aún no tiene intervenciones registradas.</p>
                      </div>
                    ) : (
                      <div className="v2-timeline">
                        {rutina.map(item => {
                          const fechaRef = item.fecha_cierre || item.created_at;
                          const enProceso = !item.fecha_cierre;
                          return (
                          <div key={item.id} className="v2-timeline-item">
                            <div className={`v2-tl-marker ${enProceso ? "tl-marker-proceso" : ""}`}></div>
                            <div className="v2-tl-date">
                              <span className="v2-date-main">{new Date(fechaRef).toLocaleDateString("es-CO")}</span>
                              <span className="v2-date-sub">{enProceso ? "En proceso" : new Date(fechaRef).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                            <div className={`v2-tl-card ${enProceso ? "tl-card-proceso" : ""}`}>
                              <div className="v2-tl-header">
                                <span className="v2-tl-consec">M-{item.consecutivo}</span>
                                <span className="v2-tl-type">{item.tipos_solicitud?.nombre || "Manual"}</span>
                                {enProceso && <span className="tl-badge-proceso">⚙️ En Proceso</span>}
                              </div>
                              <div className="v2-tl-body">
                                <p className="v2-tl-orig"><strong>Problema:</strong> {item.descripcion}</p>
                                {item.accion_realizada && (
                                  <div className="v2-tl-action">
                                    <strong>Acción realizada:</strong>
                                    <p>{item.accion_realizada}</p>
                                  </div>
                                )}
                              </div>
                              <div className="v2-tl-footer">👨‍🔧 Responsable: {item.usuario_id}</div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                   </>
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
