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

      // Actualizar estado local
      const updatedData = data[0];
      const updatedProyectos = proyectos.map(p => {
        if (p.id === selectedProyecto.id) {
          const updatedTareas = [...(p.tareas_proyecto_mant || []), updatedData];
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
        loadProyectos(); 
    }
  };

  const deleteTarea = async (tareaId) => {
    if (!confirm("¿Eliminar esta subtarea?")) return;
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
      <Navbar />
      <div className="mant-container">
        <header className="mant-header-section">
          <div>
            <h2 className="mant-title">Gestión de Proyectos</h2>
            <p className="mant-subtitle">Seguimiento de obras, mejoras y proyectos de mantenimiento — {proyectos.length} activos</p>
          </div>
          <div className="mant-actions-group">

            <button className="mant-btn-action primary" onClick={() => setShowCreateModal(true)}>+ Nuevo Proyecto</button>
          </div>
        </header>

        {error && <div className="mant-error-banner" style={{ margin: "20px 0" }}>⚠️ {error}</div>}

        {loading ? (
          <div className="mant-loading-state">Cargando proyectos de mantenimiento...</div>
        ) : (
          <div className="assets-grid-premium" style={{ marginTop: "30px" }}>
            {proyectos.map(p => {
              const avance = calcAvance(p.tareas_proyecto_mant);
              return (
                <div key={p.id} className="asset-card-v2" onClick={() => setSelectedProyecto(p)}>
                  <div className="card-v2-header">
                    <span className="v2-id-tag">PRJ-{p.id}</span>
                    <span className={`v2-type-badge`} style={{ 
                        background: avance === 100 ? "#f0fdf4" : "#eff6ff", 
                        color: avance === 100 ? "#166534" : "#1e40af" 
                    }}>
                      {p.estado || "Planeado"}
                    </span>
                  </div>
                  <div className="card-v2-icon">{avance === 100 ? "✅" : "🚀"}</div>
                  <h4 style={{ fontSize: "1.1rem", marginBottom: "8px" }}>{p.nombre}</h4>
                  <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "15px", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {p.descripcion || "Sin descripción adicional"}
                  </p>
                  
                  <div className="v2-location-info" style={{ marginBottom: "12px" }}>
                    👤 {p.encargado || "No asignado"}
                  </div>

                  <div className="card-v2-footer" style={{ flexDirection: "column", alignItems: "stretch", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: "bold" }}>
                        <span style={{ color: "#64748b" }}>Progreso</span>
                        <span style={{ color: "var(--mant-primary)" }}>{avance}%</span>
                    </div>
                    <div style={{ background: "#e2e8f0", height: "6px", borderRadius: "10px", overflow: "hidden" }}>
                        <div style={{ width: `${avance}%`, background: avance === 100 ? "#10b981" : "var(--mant-primary)", height: "100%", transition: "width 0.4s ease" }}></div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: "0.7rem", color: "#94a3b8", marginTop: "4px" }}>
                        {p.tareas_proyecto_mant?.length || 0} tareas registradas
                    </div>
                  </div>
                </div>
              );
            })}
            
            {proyectos.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "80px 20px", background: "#f8fafc", borderRadius: "20px", border: "2px dashed #e2e8f0" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "20px" }}>🏗️</div>
                    <h3 style={{ color: "#64748b" }}>No hay proyectos aún</h3>
                    <p style={{ color: "#94a3b8", marginBottom: "20px" }}>Comienza creando el primer proyecto de mejora o mantenimiento.</p>
                    <button className="mant-btn-action primary" onClick={() => setShowCreateModal(true)}>+ Crear Proyecto</button>
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
                <label>Nombre del Proyecto <span className="req">*</span></label>
                <input className="v2-input" type="text" value={formProyecto.nombre} 
                  onChange={e => setFormProyecto({...formProyecto, nombre: e.target.value})} 
                  placeholder="Ej: Instalación de red eléctrica" />
              </div>
              <div className="v2-form-group">
                <label>Descripción General</label>
                <textarea className="v2-input" rows="3" value={formProyecto.descripcion} 
                  onChange={e => setFormProyecto({...formProyecto, descripcion: e.target.value})} 
                  placeholder="Explica brevemente de qué trata el proyecto..." />
              </div>
              <div className="v2-form-row">
                <div className="v2-form-group">
                    <label>Encargado / Líder</label>
                    <input className="v2-input" type="text" value={formProyecto.encargado} 
                      onChange={e => setFormProyecto({...formProyecto, encargado: e.target.value})} 
                      placeholder="Nombre del responsable" />
                </div>
                <div className="v2-form-group">
                    <label>Fecha Objetivo</label>
                    <input className="v2-input" type="date" value={formProyecto.fecha_fin} 
                      onChange={e => setFormProyecto({...formProyecto, fecha_fin: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="modal-v2-footer">
              <button className="v2-btn-secondary" onClick={() => setShowCreateModal(false)}>Cancelar</button>
              <button className="v2-btn-primary" onClick={handleCreate} disabled={saving || !formProyecto.nombre}>
                {saving ? "Creando..." : "Crear Proyecto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLE / TAREAS */}
      {selectedProyecto && (
        <div className="mant-modal-overlay-v2" onClick={() => setSelectedProyecto(null)}>
          <div className="mant-modal-content-centered wide-v2" onClick={e => e.stopPropagation()}>
            <div className="modal-v2-header">
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ padding: "4px 10px", background: "#eff6ff", color: "#1e40af", borderRadius: "6px", fontSize: "0.75rem", fontWeight: "bold" }}>PRJ-{selectedProyecto.id}</span>
                <h3 style={{ margin: 0 }}>{selectedProyecto.nombre}</h3>
              </div>
              <button className="close-btn-v2" onClick={() => setSelectedProyecto(null)}>✖</button>
            </div>
            <div className="modal-v2-body scroll-v2" style={{ maxHeight: "75vh" }}>
              <div style={{ marginBottom: "25px", padding: "15px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ fontSize: "0.9rem", fontWeight: "bold", color: "#475569" }}>Avance General</span>
                    <span style={{ fontWeight: "bold", color: "var(--mant-primary)" }}>{calcAvance(selectedProyecto.tareas_proyecto_mant)}%</span>
                </div>
                <div style={{ background: "#cbd5e1", height: "10px", borderRadius: "10px", overflow: "hidden" }}>
                    <div style={{ width: `${calcAvance(selectedProyecto.tareas_proyecto_mant)}%`, background: "var(--mant-primary)", height: "100%", transition: "width 0.5s ease" }}></div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "25px" }}>
                {/* LISTA DE TAREAS */}
                <div>
                    <h4 style={{ marginBottom: "15px", color: "#334155" }}>📋 Subtareas y Actividades</h4>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                        <input className="v2-input" placeholder="¿Qué sigue por hacer?" value={nuevaTarea} 
                          onChange={e => setNuevaTarea(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTarea()} />
                        <button className="mant-btn-action primary" onClick={addTarea}>Añadir</button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {(!selectedProyecto.tareas_proyecto_mant || selectedProyecto.tareas_proyecto_mant.length === 0) ? (
                            <p style={{ textAlign: "center", padding: "30px", color: "#94a3b8", border: "1px dashed #e2e8f0", borderRadius: "10px" }}>
                                No hay tareas asignadas. Comienza añadiendo una arriba.
                            </p>
                        ) : (
                            selectedProyecto.tareas_proyecto_mant.map(t => (
                                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", background: t.completada ? "#f0fdf4" : "#fff", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                                    <input type="checkbox" checked={t.completada} onChange={() => toggleTarea(t)} style={{ width: "20px", height: "20px", cursor: "pointer" }} />
                                    <span style={{ flex: 1, textDecoration: t.completada ? "line-through" : "none", color: t.completada ? "#94a3b8" : "#334155" }}>{t.nombre}</span>
                                    <button onClick={() => deleteTarea(t.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem" }}>🗑️</button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* INFO LATERAL */}
                <div style={{ background: "#f8fafc", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", height: "fit-content" }}>
                    <h4 style={{ fontSize: "0.9rem", marginBottom: "15px" }}>Información</h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.85rem" }}>
                        <div>
                            <label style={{ color: "#64748b", display: "block" }}>Líder</label>
                            <strong>{selectedProyecto.encargado || "No asignado"}</strong>
                        </div>
                        <div>
                            <label style={{ color: "#64748b", display: "block" }}>Fecha Estimada</label>
                            <strong>{selectedProyecto.fecha_fin ? new Date(selectedProyecto.fecha_fin).toLocaleDateString() : "No definida"}</strong>
                        </div>
                        <div>
                            <label style={{ color: "#64748b", display: "block" }}>Estado</label>
                            <span style={{ color: "var(--mant-primary)", fontWeight: "bold" }}>{selectedProyecto.estado}</span>
                        </div>
                        <hr style={{ border: "0", borderTop: "1px solid #e2e8f0", margin: "10px 0" }} />
                        <p style={{ fontStyle: "italic", color: "#64748b" }}>{selectedProyecto.descripcion || "Sin descripción."}</p>
                    </div>
                </div>
              </div>
            </div>
            <div className="modal-v2-footer">
              <button className="v2-btn-secondary" onClick={() => setSelectedProyecto(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
