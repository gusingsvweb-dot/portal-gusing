import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, st, ss } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./Mantenimiento.css"; 
import "./GestionActivos.css";

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
  
  const [form, setForm] = useState({
    nombre: "",
    tipo: "Equipo",
    area_id: "",
    codigo: "",
    descripcion: "",
    criticidad: "Baja"
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data: act } = await supabase.from(st("activos")).select("*").order("nombre");
    const { data: ars } = await supabase.from(st("areas")).select("*").order("nombre");
    setActivos(act || []);
    setAreas(ars || []);
    setLoading(false);
  }

  async function saveActivo() {
    if (!form.nombre || !form.area_id) return alert("Nombre y Área son obligatorios");

    const { error } = await supabase.from(st("activos")).upsert([form]);
    if (error) alert("Error: " + error.message);
    else {
      setShowForm(false);
      setForm({ nombre: "", tipo: "Equipo", area_id: "", codigo: "", descripcion: "", criticidad: "Baja" });
      loadData();
    }
  }

  // REGISTRAR NUEVA ÁREA "AL VUELO"
  async function saveNewArea() {
    if (!newAreaName.trim()) return;
    const { data, error } = await supabase
      .from(st("areas"))
      .insert([{ nombre: newAreaName.trim() }])
      .select();

    if (error) {
      alert("Error al crear área: " + error.message);
    } else {
      setNewAreaName("");
      setShowAreaForm(false);
      const newAr = data[0];
      setAreas(prev => [...prev, newAr].sort((a,b) => a.nombre.localeCompare(b.nombre)));
      setForm(prev => ({ ...prev, area_id: newAr.id })); 
    }
  }

  async function loadRutina(activo) {
    setSelectedActivo(activo);
    const { data, error } = await supabase
      .from(st("solicitudes"))
      .select(`
        id,
        consecutivo,
        created_at,
        descripcion,
        accion_realizada,
        fecha_cierre,
        usuario_id,
        tipos_solicitud ( nombre )
      `)
      .eq("activo_id", activo.id)
      .not("accion_realizada", "is", null)
      .order("fecha_cierre", { ascending: false });

    if (!error) setRutina(data || []);
  }

  return (
    <>
      <Navbar />
      <div className="mant-container">
        <header className="mant-header-section">
          <div>
            <h2 className="mant-title">🏢 Gestión de Activos</h2>
            <p className="mant-subtitle">Inventario centralizado de infraestructura y equipos</p>
          </div>
          <div className="mant-actions-group">
            <button className="mant-btn secondary" onClick={() => navigate("/mantenimiento")}>
              ← Volver
            </button>
            <button className="mant-btn primary" onClick={() => setShowForm(true)}>
              + Nuevo Activo
            </button>
          </div>
        </header>

        {loading ? (
            <div className="mant-loading-state">Actualizando inventario...</div>
        ) : (
            <div className="assets-grid-premium">
            {activos.map(a => (
                <div key={a.id} className={`asset-card-v2 crit-${a.criticidad?.toLowerCase() || 'baja'}`} onClick={() => loadRutina(a)}>
                <div className="card-v2-header">
                    <span className="v2-id-tag">ID-{a.id}</span>
                    <div style={{ display: "flex", gap: "5px" }}>
                       <span className={`v2-crit-badge crit-${a.criticidad?.toLowerCase() || 'baja'}`}>{a.criticidad || 'Baja'}</span>
                       <span className="v2-type-badge">{a.tipo}</span>
                    </div>
                </div>
                <div className="card-v2-icon">
                    {a.tipo === "Equipo" ? "⚙️" : a.tipo === "Instalación" ? "🏗️" : "💻"}
                </div>
                <h4>{a.nombre}</h4>
                <div className="v2-location-info">
                    📍 {areas.find(ar => ar.id === a.area_id)?.nombre || "Sin área"}
                </div>
                <div className="card-v2-footer">
                    <span>{a.codigo || "SIN CÓDIGO"}</span>
                    <button className="mini-btn">Historial</button>
                </div>
                </div>
            ))}
            </div>
        )}

        {/* Modal Formulario (CENTRED & PREMIUM) */}
        {showForm && (
          <div className="mant-modal-overlay-v2" onClick={() => setShowForm(false)}>
            <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <h3>{form.id ? "✏️ Editar Activo" : "✨ Registrar Nuevo Activo"}</h3>
                <button className="close-btn-v2" onClick={() => setShowForm(false)}>✖</button>
              </div>
              
              <div className="modal-v2-body">
                <div className="v2-form-group">
                  <label>Nombre del Activo <span className="req">*</span></label>
                  <input 
                    className="v2-input"
                    type="text" 
                    value={form.nombre} 
                    onChange={e => setForm({...form, nombre: e.target.value})}
                    placeholder="Ej: Aire Acondicionado Central"
                  />
                </div>

                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Tipo</label>
                    <select className="v2-select" value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})}>
                      <option value="Equipo">Maquinaria / Equipo</option>
                      <option value="Instalación">Instalación / Instalación</option>
                      <option value="Computador">Equipo de Cómputo</option>
                    </select>
                  </div>
                  
                  <div className="v2-form-group">
                    <label>Área / Ubicación <span className="req">*</span></label>
                    <div style={{ display: "flex", gap: "5px" }}>
                        <select className="v2-select" value={form.area_id} onChange={e => setForm({...form, area_id: e.target.value})}>
                            <option value="">Seleccione...</option>
                            {areas.map(ar => <option key={ar.id} value={ar.id}>{ar.nombre}</option>)}
                        </select>
                        <button className="v2-add-btn" title="Nueva Ubicación" onClick={() => setShowAreaForm(!showAreaForm)}>
                            {showAreaForm ? "✖" : "+"}
                        </button>
                    </div>
                    {showAreaForm && (
                        <div className="v2-inline-form">
                            <input 
                                className="v2-input-mini"
                                placeholder="Nombre del área..."
                                value={newAreaName}
                                onChange={e => setNewAreaName(e.target.value)}
                            />
                            <button className="v2-save-mini" onClick={saveNewArea}>OK</button>
                        </div>
                    )}
                  </div>
                </div>

                <div className="v2-form-row">
                    <div className="v2-form-group">
                    <label>Código Interno</label>
                    <input 
                        className="v2-input"
                        type="text" 
                        value={form.codigo} 
                        onChange={e => setForm({...form, codigo: e.target.value})}
                        placeholder="TAG-001"
                    />
                    </div>
                    <div className="v2-form-group">
                        <label>Criticidad <span className="req">*</span></label>
                        <select className="v2-select" value={form.criticidad} onChange={e => setForm({...form, criticidad: e.target.value})}>
                            <option value="Alta">Alta (Crítico)</option>
                            <option value="Media">Media</option>
                            <option value="Baja">Baja</option>
                        </select>
                    </div>
                    <div className="v2-form-group">
                        <label>Estado Inicial</label>
                        <select className="v2-select" disabled>
                            <option>Operativo</option>
                        </select>
                    </div>
                </div>
              </div>

              <div className="modal-v2-footer">
                <button className="v2-btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button className="v2-btn-primary" onClick={saveActivo}>Confirmar Registro</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Hoja de Rutina (ENHANCED TIMELINE) */}
        {selectedActivo && (
          <div className="mant-modal-overlay-v2" onClick={() => setSelectedActivo(null)}>
            <div className="mant-modal-content-centered wide-v2" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <div className="v2-header-title">
                  <span className="icon-v2-header">{selectedActivo.tipo === "Equipo" ? "⚙️" : selectedActivo.tipo === "Instalación" ? "🏗️" : "💻"}</span>
                  <div>
                    <h3>Hoja de Rutina</h3>
                    <p>{selectedActivo.nombre} | {selectedActivo.codigo || "N/A"}</p>
                  </div>
                </div>
                <button className="close-btn-v2" onClick={() => setSelectedActivo(null)}>✖</button>
              </div>
              
              <div className="modal-v2-body scroll-v2">
                <h4 className="v2-subtitle">📜 Historial de Intervenciones</h4>
                <div className="v2-timeline">
                  {rutina.length === 0 ? (
                    <div className="v2-empty-state">
                      <div className="v2-empty-icon">📭</div>
                      <p>Este activo aún no tiene intervenciones cerradas.</p>
                    </div>
                  ) : (
                    rutina.map(item => (
                      <div key={item.id} className="v2-timeline-item">
                        <div className="v2-tl-marker"></div>
                        <div className="v2-tl-date">
                          <span className="v2-date-main">{new Date(item.fecha_cierre).toLocaleDateString()}</span>
                          <span className="v2-date-sub">{new Date(item.fecha_cierre).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
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
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
      <Footer />
    </>
  );
}
