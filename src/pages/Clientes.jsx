import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import { useNotifications } from "../context/NotificationsContext";
import { useTheme } from "../context/ThemeContext";
import Navbar from "../components/navbar";
import "./Clientes.css";

export default function Clientes() {
    const { theme } = useTheme();
    const { addNotification } = useNotifications();
    const navigate = useNavigate();

    // Estados Generales
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // Estado Modal Nuevo Cliente
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        nombre: "",
        identificacion: "",
        direccion: "",
        telefono: ""
    });
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    useEffect(() => {
        fetchClientes();
    }, []);

    const fetchClientes = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('clientes')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setClientes(data || []);
        } catch (error) {
            console.error("Error fetching clientes:", error);
            addNotification("error", "Error al cargar la cartera de clientes.");
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError("");
        setSubmitting(true);

        // Validación básica
        if (!formData.nombre.trim()) {
            setFormError("El nombre del cliente es obligatorio.");
            setSubmitting(false);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('clientes')
                .insert([
                    {
                        nombre: formData.nombre.trim(),
                        identificacion: formData.identificacion.trim() || null,
                        direccion: formData.direccion.trim() || null,
                        telefono: formData.telefono.trim() || null
                    }
                ])
                .select();

            if (error) {
                if (error.code === '23505') { // Código de violación de UNIQUE en PostgreSQL
                    throw new Error("Ya existe un cliente con ese número de identificación.");
                }
                throw error;
            }

            addNotification("success", "Cliente registrado exitosamente.");
            setClientes(prev => [data[0], ...prev]); // Añadir el nuevo arriba
            cerrarModal();
        } catch (error) {
            console.error("Error al crear cliente:", error);
            setFormError(error.message || "Ocurrió un error al registrar el cliente.");
        } finally {
            setSubmitting(false);
        }
    };

    const cerrarModal = () => {
        setShowModal(false);
        setFormData({ nombre: "", identificacion: "", direccion: "", telefono: "" });
        setFormError("");
    };

    // Filtrado de clientes
    const filteredClientes = clientes.filter(c => {
        const searchLower = searchTerm.toLowerCase();
        const nameMatch = c.nombre?.toLowerCase().includes(searchLower);
        const idMatch = c.identificacion?.toLowerCase().includes(searchLower);
        return nameMatch || idMatch;
    });

    return (
        <>
            <Navbar />
            <div className={`clientes-wrapper ${theme === 'dark' ? 'dark-theme' : ''}`}>
                <div className={`clientes-header ${theme === 'dark' ? 'dark' : 'light'}`}>
                    <div className="header-info">
                        <button className="btn-back" onClick={() => navigate("/atencion")}>
                            ⬅ Volver al Perfil
                        </button>
                        <h1>👥 Gestión de Clientes</h1>
                        <p>Base de datos comercial para atención y pedidos cruzados.</p>
                    </div>
                    <button className="btn-add-cliente" onClick={() => setShowModal(true)}>
                        <span>➕</span> Nuevo Cliente
                    </button>
                </div>

            <div className="clientes-controls">
                <input
                    type="text"
                    placeholder="🔍 Buscar por nombre o NIT/Cédula..."
                    className="search-input"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="clientes-table-container">
                {loading ? (
                    <div className="empty-state">
                        <span className="loader"></span> Cargando cartera de clientes...
                    </div>
                ) : filteredClientes.length === 0 ? (
                    <div className="empty-state">
                        {searchTerm ? 'No se encontraron clientes que coincidan con la búsqueda.' : 'No hay clientes registrados en el sistema.'}
                    </div>
                ) : (
                    <table className="clientes-table">
                        <thead>
                            <tr>
                                <th>Nombre / Razón Social</th>
                                <th>NIT / Cédula</th>
                                <th>Teléfono</th>
                                <th>Dirección</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredClientes.map((cliente) => (
                                <tr key={cliente.id}>
                                    <td className="client-name">{cliente.nombre}</td>
                                    <td>
                                        {cliente.identificacion ? (
                                            <span className="client-id">{cliente.identificacion}</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-sub)' }}>N/A</span>
                                        )}
                                    </td>
                                    <td>{cliente.telefono || <span style={{ color: 'var(--text-sub)' }}>N/A</span>}</td>
                                    <td>{cliente.direccion || <span style={{ color: 'var(--text-sub)' }}>N/A</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* MODAL NUEVO CLIENTE */}
            {showModal && (
                <div className="modal-overlay" onMouseDown={cerrarModal}>
                    <div className="modal-content" onMouseDown={(e) => e.stopPropagation()}>
                        <h2>🆕 Registrar Nuevo Cliente</h2>
                        <form onSubmit={handleSubmit}>

                            {formError && <div className="error-message">⚠️ {formError}</div>}

                            <div className="form-group">
                                <label>Nombre o Razón Social *</label>
                                <input
                                    type="text"
                                    name="nombre"
                                    value={formData.nombre}
                                    onChange={handleInputChange}
                                    placeholder="Ej: Distribuidora Farmacéutica SAS"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Identificación (NIT / Cédula)</label>
                                <input
                                    type="text"
                                    name="identificacion"
                                    value={formData.identificacion}
                                    onChange={handleInputChange}
                                    placeholder="Ej: 901234567-8"
                                />
                            </div>

                            <div className="form-group">
                                <label>Teléfono de Contacto</label>
                                <input
                                    type="text"
                                    name="telefono"
                                    value={formData.telefono}
                                    onChange={handleInputChange}
                                    placeholder="Ej: 3001234567"
                                />
                            </div>

                            <div className="form-group">
                                <label>Dirección</label>
                                <input
                                    type="text"
                                    name="direccion"
                                    value={formData.direccion}
                                    onChange={handleInputChange}
                                    placeholder="Ej: Cra 45 # 12-34, Bogotá"
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={cerrarModal} disabled={submitting}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-submit" disabled={submitting}>
                                    {submitting ? 'Guardando...' : 'Guardar Cliente'}
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            )}
        </div>
        </>
    );
}
