import React, { useEffect, useState, useMemo } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase } from "../api/supabaseClient";
import { useNavigate } from "react-router-dom"; // Importar hook
import "./Mantenimiento.css"; // Reusing styles

export default function GerenciaMantenimiento() {
    const navigate = useNavigate(); // Hook de navegación
    const [solicitudes, setSolicitudes] = useState([]);
    const [selected, setSelected] = useState(null);
    const [busqueda, setBusqueda] = useState("");

    // ============================
    // CARGAR SOLICITUDES
    // ============================
    async function loadSolicitudes() {
        const { data, error } = await supabase
            .from("solicitudes")
            .select(`
        *,
        tipos_solicitud ( nombre ),
        prioridades ( nombre ),
        estados ( nombre ),
        area_destino:areas ( nombre ),
        area_solicitante
      `)
            .eq("area_id", 1) // 🔥 SOLO MANTENIMIENTO
            .order("id", { ascending: false });

        if (!error) setSolicitudes(data || []);
    }

    useEffect(() => {
        loadSolicitudes();
    }, []);

    // FILTRO
    const solicitudesFiltradas = useMemo(() => {
        const t = busqueda.trim().toLowerCase();
        if (!t) return solicitudes;
        return solicitudes.filter((s) => {
            const blob = `${s.id} M-${s.consecutivo || ""} ${s.tipos_solicitud?.nombre || ""} ${s.area_solicitante || ""}`.toLowerCase();
            return blob.includes(t);
        });
    }, [busqueda, solicitudes]);

    // ============================
    // CLASIFICAR SOLICITUDES
    // ============================
    const pendientes = solicitudesFiltradas.filter(s => s.estado_id === 1);
    const enProceso = solicitudesFiltradas.filter(s => s.estado_id === 13);
    const finalizados = solicitudesFiltradas.filter(s => [14, 15].includes(s.estado_id));

    const closeModal = () => setSelected(null);

    return (
        <>
            <Navbar />

            <div className="mant-container">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h2 className="mant-title">🔧 Supervisión Mantenimiento</h2>
                    <div style={{ display: "flex", gap: "10px" }}>
                        <button
                            onClick={() => navigate("/kpis-mantenimiento")}
                            style={{
                                backgroundColor: "#7c3aed",
                                color: "white",
                                border: "none",
                                padding: "8px 16px",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontWeight: "bold"
                            }}
                        >
                            📊 Ver KPIs
                        </button>
                        <input
                            placeholder="🔍 Buscar..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ccc", width: "250px" }}
                        />
                    </div>
                </div>

                <div className="mant-board">
                    {/* COLUMNA PENDIENTES */}
                    <div className="mant-column">
                        <h3 className="col-header pending">
                            Pendientes <span className="count">{pendientes.length}</span>
                        </h3>
                        <div className="mant-list-area">
                            {pendientes.map((s) => (
                                <Card key={s.id} data={s} onClick={() => setSelected(s)} />
                            ))}
                            {pendientes.length === 0 && <p className="empty-msg">Sin pendientes</p>}
                        </div>
                    </div>

                    {/* COLUMNA EN PROCESO */}
                    <div className="mant-column">
                        <h3 className="col-header process">
                            En Proceso <span className="count">{enProceso.length}</span>
                        </h3>
                        <div className="mant-list-area">
                            {enProceso.map((s) => (
                                <Card key={s.id} data={s} onClick={() => setSelected(s)} />
                            ))}
                            {enProceso.length === 0 && <p className="empty-msg">Nada en curso</p>}
                        </div>
                    </div>

                    {/* COLUMNA FINALIZADOS */}
                    <div className="mant-column">
                        <h3 className="col-header done">
                            Finalizados <span className="count">{finalizados.length}</span>
                        </h3>
                        <div className="mant-list-area">
                            {finalizados.map((s) => (
                                <Card key={s.id} data={s} onClick={() => setSelected(s)} />
                            ))}
                            {finalizados.length === 0 && <p className="empty-msg">--</p>}
                        </div>
                    </div>
                </div>
            </div>

            {/* MODAL DETALLE (READ ONLY) */}
            {selected && (
                <div className="mant-modal-overlay" onClick={closeModal}>
                    <div className="mant-modal-content" onClick={e => e.stopPropagation()}>
                        <button className="close-btn" onClick={closeModal}>✖</button>

                        <div className="modal-header">
                            <h3>{selected.consecutivo ? `M-${selected.consecutivo}` : `#${selected.id}`} - {selected.tipos_solicitud?.nombre}</h3>
                            <span className={`status-badge status-${selected.estado_id}`}>
                                {selected.estados?.nombre}
                            </span>
                        </div>

                        <div className="modal-body">
                            <div className="info-grid">
                                <div>
                                    <strong>Area Solicitante:</strong>
                                    <p>{selected.area_solicitante}</p>
                                </div>
                                <div>
                                    <strong>Prioridad:</strong>
                                    <p>{selected.prioridades?.nombre}</p>
                                </div>
                                <div>
                                    <strong>Usuario:</strong>
                                    <p>{selected.usuario_id}</p>
                                </div>
                                <div>
                                    <strong>Fecha:</strong>
                                    <p>{new Date(selected.created_at).toLocaleDateString()}</p>
                                </div>
                            </div>

                            <div className="desc-section">
                                <h4>Descripción</h4>
                                <div className="text-box">{selected.descripcion}</div>
                            </div>

                            {selected.justificacion && (
                                <div className="desc-section">
                                    <h4>Justificación</h4>
                                    <div className="text-box">{selected.justificacion}</div>
                                </div>
                            )}

                            {/* Acción Realizada (Mostrar si existe) */}
                            {selected.accion_realizada && (
                                <div className="desc-section">
                                    <h4>Acción Realizada</h4>
                                    <div className="text-box action-box">{selected.accion_realizada}</div>
                                </div>
                            )}

                            <div className="readonly-msg" style={{ marginTop: "20px", textAlign: "center", color: "#666" }}>
                                Vista de Supervisión (Solo Lectura)
                            </div>

                        </div>
                    </div>
                </div>
            )}

            <Footer />
        </>
    );
}

// Subcomponente simple para la tarjeta
function Card({ data, onClick }) {
    return (
        <div className="mant-card" onClick={onClick}>
            <div className="card-top">
                <span className="card-id">{data.consecutivo ? `M-${data.consecutivo}` : `#${data.id}`}</span>
                <span className="card-priority">{data.prioridades?.nombre}</span>
            </div>
            <h4 className="card-title">{data.tipos_solicitud?.nombre}</h4>
            <p className="card-area">{data.area_solicitante}</p>
        </div>
    );
}
