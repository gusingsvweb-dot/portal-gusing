import React, { useState } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase } from "../api/supabaseClient";
import { useAuth } from "../context/AuthContext";
import "./GarantiaCalidad.css";

// Reuse DireccionTecnica styles or shared styles
import "./Produccion.css";

export default function GarantiaCalidad() {
    const { register, verifyUserAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState("users"); // "users" | "products"
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState({ text: "", type: "" });
    const [verifyingUser, setVerifyingUser] = useState(null); // { correo, usuario } | null
    const [verificationCode, setVerificationCode] = useState("");

    // --- USER FORM STATE ---
    const [userForm, setUserForm] = useState({
        usuario: "",
        correo: "",
        contrasena: "",
        rol: "usuario",
        areadetrabajo: "Producción"
    });

    const AREAS = [
        "Producción", "Dirección Técnica", "Control de Calidad", "Microbiología",
        "Acondicionamiento", "Bodega", "Atención al Cliente", "Compras",
        "Mantenimiento", "Seguridad y Salud en el Trabajo (SG SST)",
        "Gestión Ambiental", "Administración", "Gerencia"
    ];

    // --- PRODUCT FORM STATE (Replicated from DireccionTecnica) ---
    const [prodForm, setProdForm] = useState({
        articulo: "", nombre_registro_lote: "", referencia: "", forma_farmaceutica: "", presentacion_comercial: "",
        nombre_registro: "", presentacion: "", via_administracion: "", tipo_envase: "", tapa: "", linnear: "",
        gotero: "", dosificador: "", otro_accesorio: "", aspecto_proceso: "", color_proceso: "", olor_proceso: "",
        sabor_proceso: "", ph_proceso_min: "", ph_proceso_max: "", densidad_proceso_min: "", densidad_proceso_max: "",
        grado_alcoholico_proceso: "", aspecto_terminado: "", color_terminado: "", ph_terminado_min: "", ph_terminado_max: "",
        densidad_terminado_min: "", densidad_terminado_max: "", grado_alcoholico_terminado: "", volumen_min: "",
        volumen_max: "", rtma_max: "", rtchl_max: "", ecoli: "", elaborado_por: "", fecha_elaborado: "",
        aprobado_por: "", fecha_aprobado: ""
    });

    const handleUserChange = (e) => {
        const { name, value } = e.target;
        setUserForm(prev => ({ ...prev, [name]: value }));
    };

    const handleProdChange = (e) => {
        const { name, value } = e.target;
        setProdForm(prev => ({ ...prev, [name]: value }));
    };

    const handleUserSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMsg({ text: "", type: "" });

        const res = await register(userForm.usuario, userForm.correo, userForm.contrasena, userForm.rol, userForm.areadetrabajo);
        if (res.ok) {
            setMsg({ text: "Usuario creado. Ingrese el código enviado al correo del usuario para activarlo.", type: "success" });
            setVerifyingUser({ correo: userForm.correo, usuario: userForm.usuario });
        } else {
            setMsg({ text: "Error: " + res.message, type: "error" });
        }
        setLoading(false);
    };

    const handleVerifySubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMsg({ text: "", type: "" });

        const res = await verifyUserAdmin(verifyingUser.correo, verificationCode, verifyingUser.usuario);
        if (res.ok) {
            setMsg({ text: `Cuenta de ${verifyingUser.usuario} activada exitosamente.`, type: "success" });
            setVerifyingUser(null);
            setVerificationCode("");
            setUserForm({ usuario: "", correo: "", contrasena: "", rol: "usuario", areadetrabajo: "Producción" });
        } else {
            setMsg({ text: "Error de verificación: " + res.message, type: "error" });
        }
        setLoading(false);
    };

    const handleProdSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMsg({ text: "", type: "" });

        try {
            const { error } = await supabase.from('productos').insert([prodForm]);
            if (error) throw error;

            setMsg({ text: "Producto creado exitosamente.", type: "success" });
            setProdForm({
                articulo: "", nombre_registro_lote: "", referencia: "", forma_farmaceutica: "", presentacion_comercial: "",
                nombre_registro: "", presentacion: "", via_administracion: "", tipo_envase: "", tapa: "", linnear: "",
                gotero: "", dosificador: "", otro_accesorio: "", aspecto_proceso: "", color_proceso: "", olor_proceso: "",
                sabor_proceso: "", ph_proceso_min: "", ph_proceso_max: "", densidad_proceso_min: "", densidad_proceso_max: "",
                grado_alcoholico_proceso: "", aspecto_terminado: "", color_terminado: "", ph_terminado_min: "", ph_terminado_max: "",
                densidad_terminado_min: "", densidad_terminado_max: "", grado_alcoholico_terminado: "", volumen_min: "",
                volumen_max: "", rtma_max: "", rtchl_max: "", ecoli: "", elaborado_por: "", fecha_elaborado: "",
                aprobado_por: "", fecha_aprobado: ""
            });
        } catch (error) {
            console.error(error);
            setMsg({ text: "Error al guardar el producto: " + error.message, type: "error" });
        } finally {
            setLoading(false);
            window.scrollTo(0, 0);
        }
    };

    return (
        <div className="garantia-page">
            <Navbar />

            <div className="garantia-container">
                <header className="garantia-header">
                    <h1>🛡️ Panel Garantía de Calidad</h1>
                    <div className="garantia-tabs">
                        <button
                            className={`tab-btn ${activeTab === "users" ? "active" : ""}`}
                            onClick={() => { setActiveTab("users"); setMsg({ text: "", type: "" }); setVerifyingUser(null); }}
                        >
                            👥 Crear Cuenta
                        </button>
                        <button
                            className={`tab-btn ${activeTab === "products" ? "active" : ""}`}
                            onClick={() => { setActiveTab("products"); setMsg({ text: "", type: "" }); setVerifyingUser(null); }}
                        >
                            📦 Crear Producto
                        </button>
                    </div>
                </header>

                <main className="garantia-main">
                    {msg.text && (
                        <div className={`alert alert-${msg.type}`}>
                            {msg.text}
                        </div>
                    )}

                    {activeTab === "users" && !verifyingUser && (
                        <section className="form-section fade-in">
                            <h2>Crear Nueva Cuenta</h2>
                            <p className="section-desc">Registre un nuevo usuario de tipo solicitante.</p>

                            <form onSubmit={handleUserSubmit} className="admin-form">
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label>Nombre de Usuario</label>
                                        <input
                                            type="text" name="usuario" value={userForm.usuario}
                                            onChange={handleUserChange} required className="admin-input"
                                            placeholder="Ej: jf.garzon"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Correo Electrónico</label>
                                        <input
                                            type="email" name="correo" value={userForm.correo}
                                            onChange={handleUserChange} required className="admin-input"
                                            placeholder="ejemplo@gusing.com"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Contraseña Inicial</label>
                                        <input
                                            type="password" name="contrasena" value={userForm.contrasena}
                                            onChange={handleUserChange} required className="admin-input"
                                            placeholder="Mínimo 6 caracteres"
                                            minLength={6}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Área de Trabajo</label>
                                        <select
                                            name="areadetrabajo" value={userForm.areadetrabajo}
                                            onChange={handleUserChange} className="admin-input"
                                        >
                                            {AREAS.map(a => (
                                                <option key={a} value={a}>{a}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Rol asignado</label>
                                        <select
                                            name="rol"
                                            value={userForm.rol}
                                            onChange={handleUserChange}
                                            className="admin-input"
                                        >
                                            <option value="usuario">Usuario (Solicitante)</option>
                                            <option value="bodega_mp">Bodega MP (Insumos)</option>
                                            <option value="bodega_pt">Bodega PT (Despachos)</option>
                                            <option value="bodega">Bodega (General)</option>
                                            <option value="produccion">Producción</option>
                                            <option value="atencion">Atención al Cliente</option>
                                            <option value="microbiologia">Microbiología</option>
                                            <option value="controlcalidad">Control de Calidad</option>
                                            <option value="planeacion">Planeación</option>
                                            <option value="mantenimiento">Mantenimiento</option>
                                            <option value="compras">Compras</option>
                                            <option value="gerencia">Gerencia</option>
                                            <option value="direcciontecnica">Dirección Técnica</option>
                                            <option value="garantiacalidad">Garantía de Calidad</option>
                                            <option value="gestioncalidad">Gestión de Calidad</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-actions">
                                    <button type="submit" className="submit-btn" disabled={loading}>
                                        {loading ? "Procesando..." : "Siguiente: Enviar Código"}
                                    </button>
                                </div>
                            </form>
                        </section>
                    )}

                    {activeTab === "users" && verifyingUser && (
                        <section className="form-section fade-in verification-card">
                            <h2>Verificar Nueva Cuenta</h2>
                            <p className="section-desc">Ingrese el código de 6 dígitos enviado a <strong>{verifyingUser.correo}</strong></p>

                            <form onSubmit={handleVerifySubmit} className="admin-form center-form">
                                <div className="form-group">
                                    <label>Código de Verificación</label>
                                    <input
                                        type="text"
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value)}
                                        className="admin-input code-input"
                                        placeholder="000000"
                                        required
                                        maxLength={8}
                                    />
                                </div>
                                <div className="form-actions-full">
                                    <button type="submit" className="submit-btn" disabled={loading}>
                                        {loading ? "Activando..." : "✅ Activar Cuenta"}
                                    </button>
                                    <button
                                        type="button"
                                        className="cancel-btn"
                                        onClick={() => { setVerifyingUser(null); setMsg({ text: "", type: "" }); }}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </form>
                        </section>
                    )}

                    {activeTab === "products" && (
                        <section className="form-section fade-in">
                            <h2>Gestión de Productos</h2>
                            <p className="section-desc">Formulario completo para dar de alta nuevos productos en el sistema.</p>

                            <form onSubmit={handleProdSubmit} className="admin-form full-grid">
                                {/* Row 1: General */}
                                <div className="form-row-header">1. Información General</div>
                                <div className="form-grid-3">
                                    <div className="form-group">
                                        <label>Artículo (Nombre Comercial) *</label>
                                        <input type="text" name="articulo" value={prodForm.articulo} onChange={handleProdChange} required className="admin-input" />
                                    </div>
                                    <div className="form-group">
                                        <label>Referencia (PK) *</label>
                                        <input type="number" name="referencia" value={prodForm.referencia} onChange={handleProdChange} required className="admin-input" />
                                    </div>
                                    <div className="form-group">
                                        <label>Nombre Registro Lote</label>
                                        <input type="text" name="nombre_registro_lote" value={prodForm.nombre_registro_lote} onChange={handleProdChange} className="admin-input" />
                                    </div>
                                    <div className="form-group">
                                        <label>Nombre Registro (Invima)</label>
                                        <input type="text" name="nombre_registro" value={prodForm.nombre_registro} onChange={handleProdChange} className="admin-input" />
                                    </div>
                                    <div className="form-group">
                                        <label>Forma Farmacéutica</label>
                                        <input type="text" name="forma_farmaceutica" value={prodForm.forma_farmaceutica} onChange={handleProdChange} className="admin-input" />
                                    </div>
                                    <div className="form-group">
                                        <label>Presentación Comercial</label>
                                        <input type="text" name="presentacion_comercial" value={prodForm.presentacion_comercial} onChange={handleProdChange} className="admin-input" />
                                    </div>
                                </div>

                                <div className="form-row-header">2. Envase y Empaque</div>
                                <div className="form-grid-3">
                                    <div className="form-group">
                                        <label>Tipo de Envase</label>
                                        <input type="text" name="tipo_envase" value={prodForm.tipo_envase} onChange={handleProdChange} className="admin-input" />
                                    </div>
                                    <div className="form-group">
                                        <label>Tapa</label>
                                        <input type="text" name="tapa" value={prodForm.tapa} onChange={handleProdChange} className="admin-input" />
                                    </div>
                                    <div className="form-group">
                                        <label>Liner</label>
                                        <input type="text" name="linnear" value={prodForm.linnear} onChange={handleProdChange} className="admin-input" />
                                    </div>
                                </div>

                                <div className="form-row-header">3. Especificaciones (Fisicoquímicas)</div>
                                <div className="form-grid-3">
                                    <div className="form-group">
                                        <label>Aspecto Terminado</label>
                                        <input type="text" name="aspecto_terminado" value={prodForm.aspecto_terminado} onChange={handleProdChange} className="admin-input" />
                                    </div>
                                    <div className="form-group">
                                        <label>pH (Min - Max)</label>
                                        <div className="dual-input">
                                            <input type="number" step="0.01" name="ph_terminado_min" value={prodForm.ph_terminado_min} onChange={handleProdChange} placeholder="Min" className="admin-input" />
                                            <input type="number" step="0.01" name="ph_terminado_max" value={prodForm.ph_terminado_max} onChange={handleProdChange} placeholder="Max" className="admin-input" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Densidad (Min - Max)</label>
                                        <div className="dual-input">
                                            <input type="number" step="0.001" name="densidad_terminado_min" value={prodForm.densidad_terminado_min} onChange={handleProdChange} placeholder="Min" className="admin-input" />
                                            <input type="number" step="0.001" name="densidad_terminado_max" value={prodForm.densidad_terminado_max} onChange={handleProdChange} placeholder="Max" className="admin-input" />
                                        </div>
                                    </div>
                                </div>

                                <div className="form-actions">
                                    <button type="submit" className="submit-btn" disabled={loading}>
                                        {loading ? "Guardando..." : "💾 Guardar Producto"}
                                    </button>
                                </div>
                            </form>
                        </section>
                    )}
                </main>
            </div>

            <Footer />
        </div>
    );
}
