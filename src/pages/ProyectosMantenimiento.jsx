import React, { useEffect, useState } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase, st } from "../api/supabaseClient";
import { useNavigate } from "react-router-dom";
import "./Mantenimiento.css";

export default function ProyectosMantenimiento() {
  const navigate = useNavigate();
  const [proyectos, setProyectos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProyecto, setSelectedProyecto] = useState(null);

  // Form states
  const [formProyecto, setFormProyecto] = useState({ nombre: "", descripcion: "", encargado: "", fecha_fin: "" });
  const [saving, setSaving] = useState(false);
  const [nuevaTarea, setNuevaTarea] = useState("");

  useEffect(() => {
    loadProyectos();
  }, []);

  const loadProyectos = async () => {
    setLoading(true);
    try {
      // Usar st() para soporte de ambiente oficial/no oficial
      const { data, error } = await supabase
        .from(st("proyectos_mant"))
        .select(`*, tareas_proyecto_mant: ${st("tareas_proyecto_mant")}(*)`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProyectos(data || []);
    } catch (err) {
      console.error(err);
      setError("Error cargando proyectos: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formProyecto.nombre) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from(st("proyectos_mant"))
        .insert([{
          nombre: formProyecto.nombre,
          descripcion: formProyecto.descripcion,
          encargado: formProyecto.encargado,
          fecha_fin: formProyecto.fecha_fin || null,
          estado: "Planeado"
        }])
        .select();

      if (error) throw error;
      
      setShowCreateModal(false);
      setFormProyecto({ nombre: "", descripcion: "", encargado: "", fecha_fin: "" });
      loadProyectos();
    } catch (err) {
      console.error(err);
      alert("Error creando proyecto: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const addTarea = async () => {
    if (!nuevaTarea.trim() || !selectedProyecto) return;
    try {
      const { data, error } = await supabase
        .from(st("tareas_proyecto_mant"))
        .insert([{
          proyecto_id: selectedProyecto.id,
          nombre: nuevaTarea.trim(),
          completada: false
        }])
        .select();

      if (error) throw error;

      // Update local state for immediate UI feedback
      const updatedProyectos = proyectos.map(p => {
        if (p.id === selectedProyecto.id) {
          const updatedTareas = [...(p.tareas_proyecto_mant || []), data[0]];
          const pData = { ...p, tareas_proyecto_mant: updatedTareas };
          setSelectedProyecto(pData);
          return pData;
        }
        return p;
      });
      setProyectos(updatedProyectos);
      setNuevaTarea("");
    } catch (err) {
      console.error(err);
    }
  };

  const toggleTarea = async (tarea) => {
    try {
      const newState = !tarea.completada;
      const { error } = await supabase
        .from(st("tareas_proyecto_mant"))
        .update({ completada: newState })
        .eq("id", tarea.id);

      if (error) throw error;

      // Update local state
      const updatedProyectos = proyectos.map(p => {
        if (p.id === selectedProyecto.id) {
          const updatedTareas = p.tareas_proyecto_mant.map(t => t.id === tarea.id ? { ...t, completada: newState } : t);
          const pData = { ...p, tareas_proyecto_mant: updatedTareas };
          setSelectedProyecto(pData);
          return pData;
        }
        return p;
      });
      setProyectos(updatedProyectos);
      
      // Auto-update project state if all tasks are done
      checkProjectCompletion(selectedProyecto.id, updatedProyectos);
    } catch (err) {
      console.error(err);
    }
  };
  
  const checkProjectCompletion = async (projectId, currentProyectos) => {
    const proj = currentProyectos.find(p => p.id === projectId);
    if (!proj) return;
    
    const allDone = proj.tareas_proyecto_mant?.length > 0 && proj.tareas_proyecto_mant.every(t => t.completada);
    const hasStarted = proj.tareas_proyecto_mant?.some(t => t.completada);
    
    let newState = proj.estado;
    if (allDone) newState = "Finalizado";
    else if (hasStarted) newState = "En Proceso";
    else newState = "Planeado";
    
    if (newState !== proj.estado) {
        await supabase.from(st("proyectos_mant")).update({ estado: newState }).eq("id", projectId);
        loadProyectos(); // reload to get new state
    }
  };

  const deleteTarea = async (tareaId) => {
    try {
      await supabase.from(st("tareas_proyecto_mant")).delete().eq("id", tareaId);
      const updatedProyectos = proyectos.map(p => {
        if (p.id === selectedProyecto.id) {
          const updatedTareas = p.tareas_proyecto_mant.filter(t => t.id !== tareaId);
          const pData = { ...p, tareas_proyecto_mant: updatedTareas };
          setSelectedProyecto(pData);
          return pData;
        }
        return p;
      });
      setProyectos(updatedProyectos);
    } catch (err) {
      console.error(err);
    }
  };

  const calcAvance = (tareas) => {
    if (!tareas || tareas.length === 0) return 0;
    const completadas = tareas.filter(t => t.completada).length;
    return Math.round((completadas / tareas.length) * 100);
  };

  return (
    <>
      <Navbar rol="mantenimiento" />
      <div className="mant-layout">
        <header className="mant-header">
          <div>
            <h1 className="mant-title">Proyectos de Mantenimiento</h1>
            <p className="mant-subtitle">Gestión de proyectos, subtareas y seguimiento de avance</p>
          </div>
          <div className="mant-hero-img-container">
            <img src="/mantenimiento_hero.png" alt="Mantenimiento" className="mant-hero-mini-img" />
          </div>
          <div className="mant-nav-pills">
            <button className="nav-pill" onClick={() => navigate("/mantenimiento/equipos")}>Equipos</button>
            <button className="nav-pill" onClick={() => navigate("/mantenimiento/plan-maestro")}>Plan Maestro</button>
            <button className="nav-pill" onClick={() => navigate("/mantenimiento/repuestos")}>Repuestos</button>
            <button className="nav-pill active">Proyectos</button>
            <button className="nav-pill" onClick={() => navigate("/mantenimiento/proveedores")}>Personal Técnico</button>
            <button className="nav-pill kpi-pill" onClick={() => navigate("/kpis-mantenimiento")}>KPIs</button>
            <button className="nav-pill" onClick={() => setShowCreateModal(true)}>+ Nuevo Proyecto</button>
            <button className="nav-pill" onClick={() => navigate("/mantenimiento")} style={{ background: "#e2e8f0", color: "#334155" }}>Volver</button>
          </div>
        </header>

        {error && <div className="mant-error-banner">⚠️ {error}</div>}

        {loading ? (
          <div style={{ textAlign: "center", padding: "50px", color: "#64748b" }}>Cargando proyectos...</div>
        ) : (
          <div className="mant-board" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {proyectos.map(p => {
              const avance = calcAvance(p.tareas_proyecto_mant);
              return (
                <div key={p.id} className="mant-card" onClick={() => setSelectedProyecto(p)} style={{ cursor: "pointer", borderTop: avance === 100 ? "4px solid #10b981" : "4px solid #6366f1" }}>
                  <div className="card-top">
                    <span className="card-id-tag">PRJ-{p.id}</span>
                    <span className={`card-prio-badge ${avance === 100 ? "prio-1" : avance > 0 ? "prio-2" : "prio-3"}`}>
                      {p.estado || "Planeado"}
                    </span>
                  </div>
                  <h4 className="card-type" style={{ marginTop: "10px", fontSize: "1.1rem" }}>{p.nombre}</h4>
                  <p className="card-desc" style={{ marginBottom: "15px" }}>{p.descripcion || "Sin descripción"}</p>
                  
                  <div className="card-meta" style={{ marginBottom: "15px" }}>
                    <span className="card-meta-item">👤 {p.encargado || "Sin encargado"}</span>
                    {p.fecha_fin && <span className="card-meta-item">📅 {new Date(p.fecha_fin).toLocaleDateString("es-CO")}</span>}
                  </div>

                  {/* Barra de progreso visual */}
                  <div style={{ background: "#f1f5f9", borderRadius: "10px", height: "8px", width: "100%", overflow: "hidden", marginTop: "10px" }}>
                    <div style={{ width: `${avance}%`, background: avance === 100 ? "#10b981" : "#6366f1", height: "100%", transition: "width 0.3s ease" }}></div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#64748b", marginTop: "5px", fontWeight: "600" }}>
                    <span>{p.tareas_proyecto_mant?.filter(t=>t.completada).length || 0} / {p.tareas_proyecto_mant?.length || 0} tareas</span>
                    <span>{avance}% completado</span>
                  </div>
                </div>
              )
            })}
            
            {proyectos.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "50px", color: "#94a3b8" }}>
                    No hay proyectos registrados. Crea uno nuevo para empezar.
                </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL CREAR PROYECTO */}
      {showCreateModal && (
        <div className="mant-modal-overlay-v2" onClick={() => setShowCreateModal(false)}>
          <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-v2-header">
              <h3>🚀 Nuevo Proyecto</h3>
              <button className="close-btn-v2" onClick={() => setShowCreateModal(false)}>✖</button>
            </div>
            <div className="modal-v2-body">
              <div className="v2-form-group">
                <label>Nombre del Proyecto *</label>
                <input className="v2-input" type="text" value={formProyecto.nombre} onChange={e => setFormProyecto({...formProyecto, nombre: e.target.value})} placeholder="Ej: Instalación de red eléctrica en Planta 2" />
              </div>
              <div className="v2-form-group">
                <label>Descripción</label>
                <textarea className="v2-input" rows="3" value={formProyecto.descripcion} onChange={e => setFormProyecto({...formProyecto, descripcion: e.target.value})} placeholder="Detalles del proyecto..." />
              </div>
              <div className="v2-form-row">
                <div className="v2-form-group">
                    <label>Líder / Encargado</label>
                    <input className="v2-input" type="text" value={formProyecto.encargado} onChange={e => setFormProyecto({...formProyecto, encargado: e.target.value})} placeholder="Nombre del encargado" />
                </div>
                <div className="v2-form-group">
                    <label>Fecha Límite</label>
                    <input className="v2-input" type="date" value={formProyecto.fecha_fin} onChange={e => setFormProyecto({...formProyecto, fecha_fin: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="modal-v2-footer">
              <button className="v2-btn-secondary" onClick={() => setShowCreateModal(false)}>Cancelar</button>
              <button className="v2-btn-primary" onClick={handleCreate} disabled={saving || !formProyecto.nombre}>Crear Proyecto</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GESTIÓN DE TAREAS (PROYECTO) */}
      {selectedProyecto && (
        <div className="mant-modal-overlay-v2" onClick={() => setSelectedProyecto(null)}>
          <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()} style={{ maxWidth: "600px" }}>
            <div className="modal-v2-header">
              <div className="modal-title-wrap">
                <span className={`modal-state-badge ${selectedProyecto.estado === 'Finalizado' ? 'state-14' : 'state-13'}`}>
                  {selectedProyecto.estado?.toUpperCase() || 'PLANEADO'}
                </span>
                <h3>{selectedProyecto.nombre}</h3>
              </div>
              <button className="close-btn-v2" onClick={() => setSelectedProyecto(null)}>✖</button>
            </div>
            <div className="modal-v2-body">
              
              {/* Progreso General */}
              {(() => {
                const avance = calcAvance(selectedProyecto.tareas_proyecto_mant);
                return (
                  <div style={{ marginBottom: "20px", padding: "15px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontWeight: "600", color: "#334155" }}>
                      <span>Progreso del Proyecto</span>
                      <span style={{ color: avance === 100 ? "#10b981" : "#6366f1" }}>{avance}%</span>
                    </div>
                    <div style={{ background: "#cbd5e1", borderRadius: "10px", height: "10px", width: "100%", overflow: "hidden" }}>
                      <div style={{ width: `${avance}%`, background: avance === 100 ? "#10b981" : "#6366f1", height: "100%", transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)" }}></div>
                    </div>
                  </div>
                )
              })()}

              <div className="modal-section">
                <span className="modal-section-label">Checklist de Subtareas</span>
                
                {/* Input para nueva tarea */}
                <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
                    <input 
                        className="v2-input" 
                        type="text" 
                        value={nuevaTarea} 
                        onChange={e => setNuevaTarea(e.target.value)} 
                        placeholder="Añadir una nueva subtarea..." 
                        onKeyDown={e => { if (e.key === 'Enter') addTarea(); }}
                    />
                    <button className="mant-btn-action primary" onClick={addTarea}>Agregar</button>
                </div>

                {/* Lista de tareas */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "300px", overflowY: "auto", paddingRight: "5px" }}>
                  {!selectedProyecto.tareas_proyecto_mant || selectedProyecto.tareas_proyecto_mant.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "20px", color: "#94a3b8", background: "#f8fafc", borderRadius: "8px" }}>
                        No hay tareas en este proyecto aún.
                    </div>
                  ) : (
                    selectedProyecto.tareas_proyecto_mant.map(t => (
                        <div key={t.id} style={{ 
                            display: "flex", alignItems: "center", gap: "10px", padding: "12px 15px", 
                            background: t.completada ? "#f0fdf4" : "#ffffff", 
                            border: t.completada ? "1px solid #bbf7d0" : "1px solid #e2e8f0", 
                            borderRadius: "8px", transition: "all 0.2s ease" 
                        }}>
                            <input 
                                type="checkbox" 
                                checked={t.completada} 
                                onChange={() => toggleTarea(t)}
                                style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#10b981" }}
                            />
                            <span style={{ 
                                flex: 1, 
                                fontSize: "0.95rem", 
                                color: t.completada ? "#64748b" : "#334155",
                                textDecoration: t.completada ? "line-through" : "none"
                            }}>
                                {t.nombre}
                            </span>
                            <button 
                                onClick={() => deleteTarea(t.id)} 
                                style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "1.1rem", padding: "0 5px", opacity: 0.7 }}
                                onMouseEnter={e => e.target.style.opacity = 1}
                                onMouseLeave={e => e.target.style.opacity = 0.7}
                            >
                                ✖
                            </button>
                        </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="modal-v2-footer">
              <button className="mant-btn-action secondary" onClick={() => setSelectedProyecto(null)}>Cerrar Panel</button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
