import React, { useEffect, useState, useMemo } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase } from "../api/supabaseClient";
import "./KpisCompras.css";

export default function KpisCompras() {
    const [solicitudes, setSolicitudes] = useState([]);
    const [loading, setLoading] = useState(true);

    // Cargar TODAS las solicitudes de Compras (históricas incluidas)
    useEffect(() => {
        async function load() {
            const { data, error } = await supabase
                .from("solicitudes")
                .select(`
          id,
          estado_id,
          prioridad_id,
          area_solicitante,
          estados ( nombre ),
          prioridades ( nombre )
        `)
                .eq("area_id", 4); // Area 4 = Compras

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
            revision: solicitudes.filter(s => s.estado_id === 17).length,
            gerencia: solicitudes.filter(s => s.estado_id === 18).length,
            compras: solicitudes.filter(s => s.estado_id === 19).length,
            finalizados: solicitudes.filter(s => s.estado_id === 14).length,
            otros: 0
        };
        porEstado.otros = total - (porEstado.revision + porEstado.gerencia + porEstado.compras + porEstado.finalizados);

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

        return { total, porEstado, porPrioridad, porArea };
    }, [solicitudes]);

    if (loading) return <div className="kpi-loading">Cargando métricas...</div>;

    return (
        <>
            <Navbar />
            <div className="kpi-container">
                <h2 className="kpi-title">📊 KPIs y Estadísticas - Compras</h2>

                {/* TARJETAS RESUMEN */}
                <div className="kpi-summary-grid">
                    <CardStat title="Total Solicitudes" value={stats.total} icon="📦" color="blue" />
                    <CardStat title="En Revisión" value={stats.porEstado.revision} icon="👀" color="orange" />
                    <CardStat title="En Gerencia" value={stats.porEstado.gerencia} icon="👔" color="purple" />
                    <CardStat title="Por Comprar" value={stats.porEstado.compras} icon="🛒" color="indigo" />
                    <CardStat title="Finalizadas" value={stats.porEstado.finalizados} icon="✅" color="green" />
                </div>

                <div className="kpi-charts-row">

                    {/* CHART: Por Prioridad */}
                    <div className="kpi-chart-card">
                        <h3>Distribución por Prioridad</h3>
                        <div className="chart-bars">
                            {Object.entries(stats.porPrioridad).map(([key, val]) => (
                                <BarItem key={key} label={key} value={val} total={stats.total} colorClass="bar-priority" />
                            ))}
                        </div>
                    </div>

                    {/* CHART: Por Area */}
                    <div className="kpi-chart-card">
                        <h3>Solicitudes por Área</h3>
                        <div className="chart-bars">
                            {Object.entries(stats.porArea)
                                .sort((a, b) => b[1] - a[1]) // Ordenar mayor a menor
                                .slice(0, 6) // Top 6 areas
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
