import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, st } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./Mantenimiento.css";

export default function GestionRepuestos() {
  const navigate = useNavigate();
  const [repuestos, setRepuestos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  const [form, setForm] = useState({
    nombre: "",
    stock: 0,
    costo: 0,
    unidad: "Unidad"
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from(st("repuestos")).select("*").order("nombre");
    setRepuestos(data || []);
    setLoading(false);
  }

  async function saveRepuesto() {
    if (!form.nombre) return alert("Nombre es obligatorio");
    const { error } = await supabase.from(st("repuestos")).upsert([form]);
    if (error) alert("Error: " + error.message);
    else {
      setShowModal(false);
      setForm({ nombre: "", stock: 0, costo: 0, unidad: "Unidad" });
      loadData();
    }
  }

  return (
    <>
      <Navbar />
      <div className="mant-container">
        <header className="mant-header-section">
          <div>
            <h2 className="mant-title">⚙️ Gestión de Repuestos</h2>
            <p className="mant-subtitle">Inventario de insumos y refacciones para mantenimiento</p>
          </div>
          <div className="mant-actions-group">
            <button className="mant-btn secondary" onClick={() => navigate("/mantenimiento")}>
              ← Volver
            </button>
            <button className="mant-btn primary" onClick={() => setShowModal(true)}>
              + Nuevo Repuesto
            </button>
          </div>
        </header>

        {loading ? (
          <div className="mant-loading-state">Actualizando inventario...</div>
        ) : (
          <div className="repuestos-grid" style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", 
            gap: "20px",
            marginTop: "30px" 
          }}>
            {repuestos.map(r => (
              <div key={r.id} className="asset-card-v2" style={{ borderLeft: r.stock < 5 ? "5px solid #ef4444" : "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
                  <span className="v2-id-tag">REF-{r.id}</span>
                  {r.stock < 5 && <span style={{ color: "#ef4444", fontSize: "0.65rem", fontWeight: "900" }}>⚠️ BAJO STOCK</span>}
                </div>
                <h4 style={{ margin: "5px 0" }}>{r.nombre}</h4>
                <div style={{ margin: "15px 0", padding: "12px", background: "#f8fafc", borderRadius: "12px" }}>
                   <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Stock:</span>
                      <span style={{ fontWeight: "800", color: r.stock < 5 ? "#ef4444" : "#0f172a" }}>{r.stock} {r.unidad}</span>
                   </div>
                   <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Costo:</span>
                      <span style={{ fontWeight: "700" }}>${parseFloat(r.costo).toLocaleString()}</span>
                   </div>
                </div>
                <button 
                  className="mini-btn" 
                  style={{ width: "100%", background: "#f1f5f9", color: "#475569" }}
                  onClick={() => {
                    setForm(r);
                    setShowModal(true);
                  }}
                >
                  Editar Refacción
                </button>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="mant-modal-overlay-v2" onClick={() => setShowModal(false)}>
            <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <h3>{form.id ? "✏️ Editar Repuesto" : "📦 Nuevo Repuesto"}</h3>
                <button className="close-btn-v2" onClick={() => setShowModal(false)}>✖</button>
              </div>
              <div className="modal-v2-body">
                <div className="v2-form-group">
                  <label>Nombre del Insumo / Repuesto</label>
                  <input 
                    className="v2-input"
                    value={form.nombre}
                    onChange={e => setForm({...form, nombre: e.target.value})}
                    placeholder="Ej: Filtro de aire HEPA 24x24"
                  />
                </div>
                <div className="v2-form-row">
                   <div className="v2-form-group">
                      <label>Stock Actual</label>
                      <input 
                        type="number"
                        className="v2-input"
                        value={form.stock}
                        onChange={e => setForm({...form, stock: parseFloat(e.target.value)})}
                      />
                   </div>
                   <div className="v2-form-group">
                      <label>Unidad</label>
                      <select className="v2-select" value={form.unidad} onChange={e => setForm({...form, unidad: e.target.value})}>
                          <option value="Unidad">Unidad</option>
                          <option value="Litros">Litros</option>
                          <option value="Metros">Metros</option>
                          <option value="Galones">Galones</option>
                      </select>
                   </div>
                </div>
                <div className="v2-form-group">
                   <label>Costo Unitario ($)</label>
                   <input 
                    type="number"
                    className="v2-input"
                    value={form.costo}
                    onChange={e => setForm({...form, costo: parseFloat(e.target.value)})}
                  />
                </div>
              </div>
              <div className="modal-v2-footer">
                <button className="v2-btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="v2-btn-primary" onClick={saveRepuesto}>Guardar Insumo</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
