import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, st, ss } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./Mantenimiento.css";

export default function GestionProveedoresMant() {
  const navigate = useNavigate();
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    especialidad: "",
    contacto: "",
    telefono: "",
    email: ""
  });

  useEffect(() => {
    loadProveedores();
  }, []);

  async function loadProveedores() {
    setLoading(true);
    const { data } = await supabase.from(st("proveedores_mant")).select("*").order("nombre");
    setProveedores(data || []);
    setLoading(false);
  }

  async function saveProveedor() {
    if (!form.nombre) return alert("El nombre es obligatorio");
    const { error } = await supabase.from(st("proveedores_mant")).upsert([form]);
    if (error) alert("Error: " + error.message);
    else {
      setShowForm(false);
      setForm({ nombre: "", especialidad: "", contacto: "", telefono: "", email: "" });
      loadProveedores();
    }
  }

  return (
    <>
      <Navbar />
      <div className="mant-container">
        <header className="mant-header-section">
          <div>
            <h2 className="mant-title">🚚 Proveedores de Mantenimiento</h2>
            <p className="mant-subtitle">Directorio de técnicos y servicios externos</p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="mant-btn secondary" onClick={() => navigate("/mantenimiento")}>
              ← Volver al Tablero
            </button>
            <button className="mant-btn primary" onClick={() => setShowForm(true)}>
              + Nuevo Proveedor
            </button>
          </div>
        </header>

        <div className="assets-grid-premium">
          {proveedores.map(p => (
            <div key={p.id} className="asset-card-v2" onClick={() => { setForm(p); setShowForm(true); }}>
              <div className="card-v2-header">
                <span className="v2-id-tag">PROV-{p.id}</span>
                <span className="v2-type-badge">{p.especialidad || "General"}</span>
              </div>
              <div className="card-v2-icon">👷</div>
              <h4>{p.nombre}</h4>
              <div className="v2-location-info">👤 {p.contacto || "Sin contacto"}</div>
              <div className="provider-contact-info" style={{ fontSize: "0.8rem", color: "#64748b", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span>📞 {p.telefono || "---"}</span>
                  <span>📧 {p.email || "---"}</span>
              </div>
              <div className="card-v2-footer">
                  <button className="mini-btn">Editar Perfil</button>
              </div>
            </div>
          ))}
          {proveedores.length === 0 && <p className="empty-state">No hay proveedores registrados.</p>}
        </div>

        {/* Modal Formulario (CENTRED & PREMIUM) */}
        {showForm && (
          <div className="mant-modal-overlay-v2" onClick={() => setShowForm(false)}>
            <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <h3>{form.id ? "✏️ Editar Proveedor" : "👷 Nuevo Proveedor"}</h3>
                <button className="close-btn-v2" onClick={() => setShowForm(false)}>✖</button>
              </div>
              
              <div className="modal-v2-body">
                <div className="v2-form-group">
                  <label>Nombre de la Empresa / Técnico <span className="req">*</span></label>
                  <input 
                    className="v2-input"
                    type="text" 
                    value={form.nombre} 
                    onChange={e => setForm({...form, nombre: e.target.value})}
                    placeholder="Ej: Técnicos Unidos S.A.S"
                  />
                </div>

                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Especialidad</label>
                    <input 
                      className="v2-input"
                      type="text" 
                      value={form.especialidad} 
                      onChange={e => setForm({...form, especialidad: e.target.value})}
                      placeholder="Ej: Refrigeración, Eléctrico"
                    />
                  </div>
                  <div className="v2-form-group">
                    <label>Persona de Contacto</label>
                    <input 
                      className="v2-input"
                      type="text" 
                      value={form.contacto} 
                      onChange={e => setForm({...form, contacto: e.target.value})}
                      placeholder="Nombre del encargado..."
                    />
                  </div>
                </div>

                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Teléfono</label>
                    <input 
                      className="v2-input"
                      type="text" 
                      value={form.telefono} 
                      onChange={e => setForm({...form, telefono: e.target.value})}
                      placeholder="+57..."
                    />
                  </div>
                  <div className="v2-form-group">
                    <label>Email</label>
                    <input 
                      className="v2-input"
                      type="email" 
                      value={form.email} 
                      onChange={e => setForm({...form, email: e.target.value})}
                      placeholder="contacto@empresa.com"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-v2-footer">
                <button className="v2-btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button className="v2-btn-primary" onClick={saveProveedor}>Guardar Proveedor</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
