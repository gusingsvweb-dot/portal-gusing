import React, { useEffect, useState, useMemo } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase, st, ss } from "../api/supabaseClient";
import "./KpisCompras.css"; // Reusing styles

export default function KpisMantenimiento() {
    const [solicitudes, setSolicitudes] = useState([]);
    const [loading, setLoading] = useState(true);

    // Cargar TODAS las solicitudes de Mantenimiento
    useEffect(() => {
        async function load() {
            const { data, error } = await supabase
                .from(st("solicitudes"))
                .select(ss(`
          id,
          estado_id,
          prioridad_id,
          area_solicitante,
          created_at,
          fecha_cierre,
          tipo_solicitud_id,
          estados ( nombre ),
          prioridades ( nombre ),
          activos ( criticidad )
        `))
                .eq("area_id", 1); 

            if (!error) {
                setSolicitudes(data || []);
            }
            setLoading(false);
        }
        load();
    }, []);

    // PROCESAMIENTO DE DATOS
    const stats = useMemo(() => {
        const total = solicitudes.length;

        // Conteo por Estados
        const porEstado = {
            pendientes: solicitudes.filter(s => s.estado_id === 1).length,
            proceso: solicitudes.filter(s => s.estado_id === 13).length,
            finalizados: solicitudes.filter(s => [14, 15].includes(s.estado_id)).length,
            otros: 0
        };
        // Just in case there are other states
        porEstado.otros = total - (porEstado.pendientes + porEstado.proceso + porEstado.finalizados);

        // Conteo por Prioridad
        const porPrioridad = solicitudes.reduce((acc, curr) => {
            const p = curr.prioridades?.nombre || "Sin Prioridad";
            acc[p] = (acc[p] || 0) + 1;
            return acc;
        }, {});

        // Conteo por Area Solicitante
        const porArea = solicitudes.reduce((acc, curr) => {
            const a = curr.area_solicitante || "Desconocida";
            acc[a] = (acc[a] || 0) + 1;
            return acc;
        }, {});

        // MTTR (Mean Time to Repair) - Solo finalizados
        const finalizados = solicitudes.filter(s => s.fecha_cierre && s.created_at);
        let totalHoras = 0;
        finalizados.forEach(s => {
            const horas = (new Date(s.fecha_cierre) - new Date(s.created_at)) / (1000 * 60 * 60);
            totalHoras += horas;
        });
        const mttr = finalizados.length > 0 ? (totalHoras / finalizados.length).toFixed(1) : 0;

        // Distribución por Criticidad
        const porCriticidad = solicitudes.reduce((acc, curr) => {
            const c = curr.activos?.criticidad || "Baja";
            acc[c] = (acc[c] || 0) + 1;
            return acc;
        }, {});

        // Ratio Preventivo vs Correctivo
        const ratio = {
            preventivo: solicitudes.filter(s => s.tipo_solicitud_id === 2).length, // Asumido 2
            correctivo: solicitudes.filter(s => s.tipo_solicitud_id === 1).length, // Asumido 1
        };

        return { total, porEstado, porPrioridad, porArea, mttr, porCriticidad, ratio };
    }, [solicitudes]);

    if (loading) return <div className="kpi-loading">Cargando métricas...</div>;

    return (
        <>
            <Navbar />
            <div className="kpi-container">
                <h2 className="kpi-title">📊 KPIs y Estadísticas - Mantenimiento</h2>

                {/* TARJETAS RESUMEN */}
                <div className="kpi-summary-grid">
                    <CardStat title="Total Solicitudes" value={stats.total} icon="🔧" color="blue" />
                    <CardStat title="MTTR (Horas Promedio)" value={stats.mttr} icon="⏱️" color="red" />
                    <CardStat title="Preventivos" value={stats.ratio.preventivo} icon="📅" color="purple" />
                    <CardStat title="Correctivos" value={stats.ratio.correctivo} icon="🚨" color="orange" />
                </div>

                <div className="kpi-charts-row">

                    {/* CHART: Por Criticidad */}
                    <div className="kpi-chart-card">
                        <h3>Impacto por Criticidad</h3>
                        <div className="chart-bars">
                            {Object.entries(stats.porCriticidad).map(([key, val]) => (
                                <BarItem key={key} label={key} value={val} total={stats.total} colorClass={`bar-${key.toLowerCase()}`} />
                            ))}
                        </div>
                    </div>

                    {/* CHART: Por Area */}
                    <div className="kpi-chart-card">
                        <h3>Solicitudes por Área</h3>
                        <div className="chart-bars">
                            {Object.entries(stats.porArea)
                                .sort((a, b) => b[1] - a[1]) 
                                .slice(0, 5) 
                                .map(([key, val]) => (
                                    <BarItem key={key} label={key} value={val} total={stats.total} colorClass="bar-area" />
                                ))}
                        </div>
                    </div>

                </div>

            </div>
            <Footer />
        </>
    );
}

// Subcomponente Tarjeta
function CardStat({ title, value, icon, color }) {
    return (
        <div className={`stat-card border-${color}`}>
            <div className="stat-icon">{icon}</div>
            <div className="stat-info">
                <span className="stat-value">{value}</span>
                <span className="stat-label">{title}</span>
            </div>
        </div>
    );
}

// Subcomponente Barra Simple
function BarItem({ label, value, total, colorClass }) {
    const pct = total > 0 ? (value / total) * 100 : 0;
    return (
        <div className="bar-wrapper">
            <div className="bar-header">
                <span>{label}</span>
                <strong>{value}</strong>
            </div>
            <div className="bar-track">
                <div
                    className={`bar-fill ${colorClass}`}
                    style={{ width: `${pct}%` }}
                ></div>
            </div>
        </div>
    );
}
