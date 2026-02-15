import React, { useState } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase } from "../api/supabaseClient";
import "./Produccion.css"; // Reuse existing styles for consistency
import { useAuth } from "../context/AuthContext";

export default function DireccionTecnica() {
    const { usuarioActual } = useAuth();
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState({ text: "", type: "" }); // type: success | error

    // Form State matching 'productos' table columns
    const [form, setForm] = useState({
        articulo: "",
        nombre_registro_lote: "",
        referencia: "", // PK, bigint
        forma_farmaceutica: "",
        presentacion_comercial: "",
        nombre_registro: "",
        presentacion: "",
        via_administracion: "",

        // Envase
        tipo_envase: "",
        tapa: "",
        linnear: "",
        gotero: "", // "gotero" in DB schema (might be typo for 'gotero' or 'liner' is 'linnear'?) DB schema says 'linnear' and 'gotero'.
        dosificador: "",
        otro_accesorio: "",

        // Proceso (Granel)
        aspecto_proceso: "",
        color_proceso: "",
        olor_proceso: "",
        sabor_proceso: "",
        ph_proceso_min: "",
        ph_proceso_max: "",
        densidad_proceso_min: "",
        densidad_proceso_max: "",
        grado_alcoholico_proceso: "",

        // Terminado
        aspecto_terminado: "",
        color_terminado: "",
        ph_terminado_min: "",
        ph_terminado_max: "",
        densidad_terminado_min: "",
        densidad_terminado_max: "",
        grado_alcoholico_terminado: "",
        volumen_min: "",
        volumen_max: "",

        // Microbiología
        rtma_max: "",
        rtchl_max: "",
        ecoli: "",

        // Aprobación
        elaborado_por: "",
        fecha_elaborado: "",
        aprobado_por: "",
        fecha_aprobado: ""
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMsg({ text: "", type: "" });

        // Validations (Basic)
        if (!form.articulo || !form.referencia) {
            setMsg({ text: "Los campos Artículo y Referencia son obligatorios.", type: "error" });
            setLoading(false);
            return;
        }

        try {
            const { error } = await supabase
                .from('productos')
                .insert([form]);

            if (error) throw error;

            setMsg({ text: "Producto creado exitosamente.", type: "success" });
            // Optional: Reset form or redirect
            setForm({
                articulo: "", nombre_registro_lote: "", referencia: "", forma_farmaceutica: "", presentacion_comercial: "",
                nombre_registro: "", presentacion: "", via_administracion: "", tipo_envase: "", tapa: "", linnear: "",
                gotero: "", dosificador: "", otro_accesorio: "", aspecto_proceso: "", color_proceso: "", olor_proceso: "",
                sabor_proceso: "", ph_proceso_min: "", ph_proceso_max: "", densidad_proceso_min: "", densidad_proceso_max: "",
                grado_alcoholico_proceso: "", aspecto_terminado: "", color_terminado: "", ph_terminado_min: "", ph_terminado_max: "",
                densidad_terminado_min: "", densidad_terminado_max: "", grado_alcoholico_terminado: "", volumen_min: "",
                volumen_max: "", rtma_max: "", rtchl_max: "", ecoli: "", elaborado_por: "", fecha_elaborado: "",
                aprobado_por: "", fecha_aprobado: ""
            });
            window.scrollTo(0, 0);

        } catch (error) {
            console.error("Error creating product:", error);
            let errMsg = "Error al guardar el producto.";
            if (error.code === '23505') errMsg = "Error: Ya existe un producto con esa Referencia.";
            setMsg({ text: errMsg, type: "error" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Navbar />
            <div className="pc-wrapper" style={{ display: "block", maxWidth: "1200px", margin: "0 auto" }}>
                <div className="pc-box" style={{ background: "#fff", padding: "40px" }}>
                    <h2 style={{ color: "#1d3557", borderBottom: "2px solid #e2e8f0", paddingBottom: "15px", marginBottom: "30px" }}>
                        🧪 Gestión de Productos (Dirección Técnica)
                    </h2>

                    {msg.text && (
                        <div style={{
                            padding: "15px", borderRadius: "8px", marginBottom: "20px",
                            background: msg.type === 'error' ? "#fee2e2" : "#dcfce7",
                            color: msg.type === 'error' ? "#991b1b" : "#166534",
                            border: `1px solid ${msg.type === 'error' ? "#f87171" : "#86efac"}`
                        }}>
                            {msg.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px 50px" }}>

                        {/* SECCIÓN 1: GENERAL */}
                        <div style={{ gridColumn: "1 / -1", marginTop: "40px" }}>
                            <h3 style={{ color: "#2b6ded", borderBottom: "1px dashed #cbd5e0", paddingBottom: "5px" }}>1. Información General</h3>
                        </div>

                        <div className="form-group">
                            <label>Artículo (Nombre Comercial) *</label>
                            <input type="text" name="articulo" value={form.articulo} onChange={handleChange} required className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Referencia (Código Único/PK) *</label>
                            <input type="number" name="referencia" value={form.referencia} onChange={handleChange} required className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Nombre Registro Lote</label>
                            <input type="text" name="nombre_registro_lote" value={form.nombre_registro_lote} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Nombre Registro (Invima)</label>
                            <input type="text" name="nombre_registro" value={form.nombre_registro} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Forma Farmacéutica</label>
                            <input type="text" name="forma_farmaceutica" value={form.forma_farmaceutica} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Presentación Comercial</label>
                            <input type="text" name="presentacion_comercial" value={form.presentacion_comercial} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Presentación (Envase)</label>
                            <input type="text" name="presentacion" value={form.presentacion} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Vía de Administración</label>
                            <input type="text" name="via_administracion" value={form.via_administracion} onChange={handleChange} className="pc-input" />
                        </div>


                        {/* SECCIÓN 2: ENVASE Y EMPAQUE */}
                        <div style={{ gridColumn: "1 / -1", marginTop: "40px" }}>
                            <h3 style={{ color: "#2b6ded", borderBottom: "1px dashed #cbd5e0", paddingBottom: "5px" }}>2. Envase y Empaque</h3>
                        </div>

                        <div className="form-group">
                            <label>Tipo de Envase</label>
                            <input type="text" name="tipo_envase" value={form.tipo_envase} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Tapa</label>
                            <input type="text" name="tapa" value={form.tapa} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Liner (Linnear)</label>
                            <input type="text" name="linnear" value={form.linnear} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Gotero</label>
                            <input type="text" name="gotero" value={form.gotero} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Dosificador</label>
                            <input type="text" name="dosificador" value={form.dosificador} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Otro Accesorio</label>
                            <input type="text" name="otro_accesorio" value={form.otro_accesorio} onChange={handleChange} className="pc-input" />
                        </div>


                        {/* SECCIÓN 3: ESPECIFICACIONES (GRANEL) */}
                        <div style={{ gridColumn: "1 / -1", marginTop: "20px" }}>
                            <h3 style={{ color: "#2b6ded", borderBottom: "1px dashed #cbd5e0", paddingBottom: "5px" }}>3. Especificaciones (Proceso/Granel)</h3>
                        </div>

                        <div className="form-group">
                            <label>Aspecto</label>
                            <input type="text" name="aspecto_proceso" value={form.aspecto_proceso} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Color</label>
                            <input type="text" name="color_proceso" value={form.color_proceso} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Olor</label>
                            <input type="text" name="olor_proceso" value={form.olor_proceso} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Sabor</label>
                            <input type="text" name="sabor_proceso" value={form.sabor_proceso} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group-dobl" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                                <label>pH Min</label>
                                <input type="number" step="0.01" name="ph_proceso_min" value={form.ph_proceso_min} onChange={handleChange} className="pc-input" />
                            </div>
                            <div>
                                <label>pH Max</label>
                                <input type="number" step="0.01" name="ph_proceso_max" value={form.ph_proceso_max} onChange={handleChange} className="pc-input" />
                            </div>
                        </div>
                        <div className="form-group-dobl" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label>Densidad Min</label>
                                <input type="number" step="0.001" name="densidad_proceso_min" value={form.densidad_proceso_min} onChange={handleChange} className="pc-input" />
                            </div>
                            <div>
                                <label>Densidad Max</label>
                                <input type="number" step="0.001" name="densidad_proceso_max" value={form.densidad_proceso_max} onChange={handleChange} className="pc-input" />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Grado Alcohólico</label>
                            <input type="text" name="grado_alcoholico_proceso" value={form.grado_alcoholico_proceso} onChange={handleChange} className="pc-input" />
                        </div>


                        {/* SECCIÓN 4: ESPECIFICACIONES (TERMINADO) */}
                        <div style={{ gridColumn: "1 / -1", marginTop: "20px" }}>
                            <h3 style={{ color: "#2b6ded", borderBottom: "1px dashed #cbd5e0", paddingBottom: "5px" }}>4. Especificaciones (Producto Terminado)</h3>
                        </div>

                        <div className="form-group">
                            <label>Aspecto</label>
                            <input type="text" name="aspecto_terminado" value={form.aspecto_terminado} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Color</label>
                            <input type="text" name="color_terminado" value={form.color_terminado} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group-dobl" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label>pH Min</label>
                                <input type="number" step="0.01" name="ph_terminado_min" value={form.ph_terminado_min} onChange={handleChange} className="pc-input" />
                            </div>
                            <div>
                                <label>pH Max</label>
                                <input type="number" step="0.01" name="ph_terminado_max" value={form.ph_terminado_max} onChange={handleChange} className="pc-input" />
                            </div>
                        </div>
                        <div className="form-group-dobl" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label>Densidad Min</label>
                                <input type="number" step="0.001" name="densidad_terminado_min" value={form.densidad_terminado_min} onChange={handleChange} className="pc-input" />
                            </div>
                            <div>
                                <label>Densidad Max</label>
                                <input type="number" step="0.001" name="densidad_terminado_max" value={form.densidad_terminado_max} onChange={handleChange} className="pc-input" />
                            </div>
                        </div>
                        <div className="form-group-dobl" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label>Volumen Min</label>
                                <input type="number" step="0.1" name="volumen_min" value={form.volumen_min} onChange={handleChange} className="pc-input" />
                            </div>
                            <div>
                                <label>Volumen Max</label>
                                <input type="number" step="0.1" name="volumen_max" value={form.volumen_max} onChange={handleChange} className="pc-input" />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Grado Alcohólico</label>
                            <input type="text" name="grado_alcoholico_terminado" value={form.grado_alcoholico_terminado} onChange={handleChange} className="pc-input" />
                        </div>


                        {/* SECCIÓN 5: MICROBIOLOGÍA */}
                        <div style={{ gridColumn: "1 / -1", marginTop: "20px" }}>
                            <h3 style={{ color: "#2b6ded", borderBottom: "1px dashed #cbd5e0", paddingBottom: "5px" }}>5. Especificaciones Microbiológicas</h3>
                        </div>

                        <div className="form-group">
                            <label>RTMA Max (UFC/g)</label>
                            <input type="number" name="rtma_max" value={form.rtma_max} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>RTCHL Max (UFC/g)</label>
                            <input type="number" name="rtchl_max" value={form.rtchl_max} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>E. Coli / Patógenos</label>
                            <input type="text" name="ecoli" value={form.ecoli} onChange={handleChange} className="pc-input" placeholder="Ej. Ausencia/g" />
                        </div>


                        {/* SECCIÓN 6: APROBACIONES */}
                        <div style={{ gridColumn: "1 / -1", marginTop: "20px" }}>
                            <h3 style={{ color: "#2b6ded", borderBottom: "1px dashed #cbd5e0", paddingBottom: "5px" }}>6. Aprobación</h3>
                        </div>

                        <div className="form-group">
                            <label>Elaborado por</label>
                            <input type="text" name="elaborado_por" value={form.elaborado_por} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Fecha Elaboración</label>
                            <input type="date" name="fecha_elaborado" value={form.fecha_elaborado} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Aprobado por</label>
                            <input type="text" name="aprobado_por" value={form.aprobado_por} onChange={handleChange} className="pc-input" />
                        </div>
                        <div className="form-group">
                            <label>Fecha Aprobación</label>
                            <input type="date" name="fecha_aprobado" value={form.fecha_aprobado} onChange={handleChange} className="pc-input" />
                        </div>


                        <div style={{ gridColumn: "1 / -1", marginTop: "30px", textAlign: "right" }}>
                            <button type="submit" className="pc-btn" disabled={loading} style={{ width: "auto", padding: "12px 30px", fontSize: "16px" }}>
                                {loading ? "Guardando..." : "💾 Guardar Producto"}
                            </button>
                        </div>

                    </form>
                </div>
            </div>
            <Footer />

            {/* Inline Styles for Form Layout */}
            <style>{`
        .pc-input {
          width: 100%;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid #cbd5e0;
          font-size: 14px;
          margin-top: 5px;
          box-sizing: border-box;
        }
        .pc-input:focus {
          outline: none;
          border-color: #2b6ded;
          box-shadow: 0 0 0 3px rgba(43, 109, 237, 0.1);
        }
        .form-group label {
          font-weight: 600;
          color: #4a5568;
          font-size: 13px;
          display: block;
          margin-bottom: 8px;
        }
      `}</style>
        </>
    );
}
