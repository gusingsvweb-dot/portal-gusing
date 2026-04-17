import React, { useEffect, useState, useMemo } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase, st, ss } from "../api/supabaseClient";
import { useNavigate } from "react-router-dom";
import "./Mantenimiento.css";

export default function GerenciaMantenimiento() {
    const navigate = useNavigate();
    const [solicitudes, setSolicitudes] = useState([]);
    const [selected, setSelected] = useState(null);
    const [busqueda, setBusqueda] = useState("");
    const [loading, setLoading] = useState(true);

    // ============================
    // CARGAR SOLICITUDES
    // ============================
    async function loadData() {
        setLoading(true);
        const { data, error } = await supabase
            .from(st("solicitudes"))
            .select(ss(`
                *,
                tipos_solicitud ( nombre ),
                prioridades ( nombre ),
                estados ( nombre ),
                area_destino:areas ( nombre ),
                activos ( nombre, tipo, codigo ),
                proveedor:proveedores_mant ( nombre )
            `))
            .eq("area_id", 1) // 🔥 SOLO MANTENIMIENTO
            .order("id", { ascending: false });

        if (!error) setSolicitudes(data || []);
        setLoading(false);
    }

    useEffect(() => {
        loadData();
    }, []);

    // FILTRO
    const solicitudesFiltradas = useMemo(() => {
        const t = busqueda.trim().toLowerCase();
        if (!t) return solicitudes;
        return solicitudes.filter((s) => {
            const blob = `${s.id} M-${s.consecutivo || ""} ${s.tipos_solicitud?.nombre || ""} ${s.activos?.nombre || ""} ${s.area_solicitante || ""}`.toLowerCase();
            return blob.includes(t);
        });
    }, [busqueda, solicitudes]);

    // STATS
    const stats = useMemo(() => {
        return {
            total: solicitudes.length,
            pendientes: solicitudes.filter(s => s.estado_id === 1).length,
            proceso: solicitudes.filter(s => s.estado_id === 13).length,
            finalizados: solicitudes.filter(s => [14, 15].includes(s.estado_id)).length
        };
    }, [solicitudes]);

    const closeModal = () => setSelected(null);

    if (loading) return <div className="mant-container"><h3>Cargando supervisión...</h3></div>;

    return (
        <>
            <Navbar />

            <div className="mant-container">
                <header className="mant-header-section">
                    <div>
                        <h2 className="mant-title">🔍 Supervisión de Mantenimiento</h2>
                        <p className="mant-subtitle">Panel de control y auditoría</p>
                    </div>
                    <div style={{ display: "flex", gap: "10px" }}>
                        <button className="mant-btn primary" onClick={() => navigate("/mantenimiento/activos")}>
                            🏢 Activos
                        </button>
                        <button className="mant-btn primary" onClick={() => navigate("/mantenimiento/proveedores")}>
                            🚚 Proveedores
                        </button>
                        <button className="mant-btn secondary" onClick={() => navigate("/kpis-mantenimiento")}>
                            📊 KPIs
                        </button>
                        <input
                            placeholder="🔍 Buscar equipo, área o ID..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            style={{ padding: "10px", borderRadius: "10px", border: "1px solid var(--mant-border)", width: "300px" }}
                        />
                    </div>
                </header>

                {/* STAT CARDS */}
                <div className="mant-stats-row">
                    <StatCard label="Total" value={stats.total} />
                    <StatCard label="Pendientes" value={stats.pendientes} />
                    <StatCard label="En Proceso" value={stats.proceso} />
                    <StatCard label="Finalizados" value={stats.finalizados} />
                </div>

                <div className="mant-board">
                    <Column title="Pendientes" type="pending" items={solicitudesFiltradas.filter(s => s.estado_id === 1)} onCardClick={setSelected} />
                    <Column title="En Proceso" type="process" items={solicitudesFiltradas.filter(s => s.estado_id === 13)} onCardClick={setSelected} />
                    <Column title="Finalizados" type="done" items={solicitudesFiltradas.filter(s => [14, 15].includes(s.estado_id))} onCardClick={setSelected} />
                </div>
            </div>

            {/* MODAL DETALLE (READ ONLY) */}
            {selected && (
                <div className="mant-modal-overlay" onClick={closeModal}>
                    <div className="mant-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <span className="status-badge-premium" style={{ 
                                    background: selected.estado_id === 1 ? "var(--status-pending)" : 
                                               selected.estado_id === 13 ? "var(--status-process)" : "var(--status-done)",
                                    color: "white"
                                }}>
                                    {selected.estados?.nombre}
                                </span>
                                <h3>{selected.consecutivo ? `M-${selected.consecutivo}` : `#${selected.id}`}</h3>
                            </div>
                            <button className="close-btn" onClick={closeModal}>✖</button>
                        </div>

                        <div className="modal-body">
                            <div className="info-grid-premium">
                                <InfoBox label="Tipo" value={selected.tipos_solicitud?.nombre} />
                                <InfoBox label="Prioridad" value={selected.prioridades?.nombre} />
                                <InfoBox label="Solicitante" value={selected.usuario_id} />
                                <InfoBox label="Área" value={selected.area_solicitante} />
                                <InfoBox label="Activo" value={selected.activos?.nombre || "N/A"} />
                                <InfoBox label="Proveedor" value={selected.proveedor?.nombre || "No asignado"} />
                            </div>

                            <div className="desc-section">
                                <span className="section-label">📝 Descripción</span>
                                <div className="text-box-premium">{selected.descripcion}</div>
                            </div>

                            {selected.accion_realizada && (
                                <div className="desc-section">
                                    <span className="section-label">⚙️ Acción Realizada (Solución)</span>
                                    <div className="text-box-premium" style={{ background: "hsla(142, 71%, 95%, 1)", borderColor: "var(--status-done)" }}>
                                        {selected.accion_realizada}
                                    </div>
                                </div>
                            )}

                            <div className="readonly-msg" style={{ marginTop: "20px", textAlign: "center", color: "#666", fontSize: "0.8rem", fontStyle: "italic" }}>
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

// Subcomponentes reutilizados
function StatCard({ label, value }) {
    return (
        <div className="mant-stat-card">
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
        </div>
    );
}

function Column({ title, type, items, onCardClick }) {
    return (
        <div className="mant-column">
            <div className={`col-header ${type}`}>
                <h3>{title}</h3>
                <span className="count-badge">{items.length}</span>
            </div>
            <div className="mant-list-area">
                {items.map(s => (
                    <ProfessionalCard key={s.id} data={s} onClick={() => onCardClick(s)} />
                ))}
            </div>
        </div>
    );
}

function ProfessionalCard({ data, onClick }) {
    return (
        <div className="mant-card" onClick={onClick}>
            <div className="card-top">
                <span className="card-tag tag-id">{data.consecutivo ? `M-${data.consecutivo}` : `#${data.id}`}</span>
            </div>
            <h4>{data.tipos_solicitud?.nombre}</h4>
            <div className="card-info-item">👤 {data.area_solicitante}</div>
            {data.activos && (
                <div className="card-asset-tag">
                    <span>⚙️ {data.activos.nombre}</span>
                </div>
            )}
        </div>
    );
}

function InfoBox({ label, value }) {
    return (
        <div className="info-item-box">
            <label>{label}</label>
            <span>{value || "---"}</span>
        </div>
    );
}
