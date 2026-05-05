import { useEffect, useState, useMemo } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase, st, ss } from "../api/supabaseClient";
import { useNavigate } from "react-router-dom";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement,
  Title, Tooltip, Legend,
} from "chart.js";
import "./KpisMantenimiento.css";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: "#1e293b", padding: 12, cornerRadius: 10 } },
  scales: {
    x: { grid: { display: false }, ticks: { color: "#64748b", font: { weight: "600" } } },
    y: { grid: { color: "#f1f5f9" }, ticks: { color: "#64748b" }, beginAtZero: true },
  },
};

export default function KpisMantenimiento() {
  const navigate = useNavigate();
  const [solicitudes, setSolicitudes] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: sol }, { data: pls }] = await Promise.all([
        supabase.from(st("solicitudes")).select(ss(`
          id, estado_id, prioridad_id, area_solicitante, created_at, fecha_cierre,
          tipo_solicitud_id, estados(nombre), prioridades(nombre), activos(criticidad, nombre)
        `)).eq("area_id", 1),
        supabase.from(st("planes_preventivos")).select("id, activo"),
      ]);
      setSolicitudes(sol || []);
      setPlanes(pls || []);
      setLoading(false);
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const total = solicitudes.length;
    const finalizados = solicitudes.filter(s => s.fecha_cierre && s.created_at && [14, 15].includes(s.estado_id));
    const totalHoras = finalizados.reduce((sum, s) => sum + (new Date(s.fecha_cierre) - new Date(s.created_at)) / 3600000, 0);
    const mttr = finalizados.length > 0 ? (totalHoras / finalizados.length).toFixed(1) : 0;

    const preventivos = solicitudes.filter(s => s.tipo_solicitud_id === 2).length;
    const correctivos = solicitudes.filter(s => s.tipo_solicitud_id === 1).length;
    const ratio = total > 0 ? Math.round((preventivos / total) * 100) : 0;

    const porCriticidad = solicitudes.reduce((acc, s) => {
      const c = s.activos?.criticidad || "Sin activo";
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});

    const porArea = Object.entries(
      solicitudes.reduce((acc, s) => {
        const a = s.area_solicitante || "Desconocida";
        acc[a] = (acc[a] || 0) + 1;
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 6);

    const porEstado = {
      Pendientes: solicitudes.filter(s => s.estado_id === 1).length,
      "En Proceso": solicitudes.filter(s => s.estado_id === 13).length,
      Finalizados: solicitudes.filter(s => [14, 15].includes(s.estado_id)).length,
    };

    const planesActivos = planes.filter(p => p.activo !== false).length;

    return { total, mttr, preventivos, correctivos, ratio, porCriticidad, porArea, porEstado, finalizados: finalizados.length, planesActivos };
  }, [solicitudes, planes]);

  const criticidadChartData = {
    labels: Object.keys(stats.porCriticidad),
    datasets: [{
      data: Object.values(stats.porCriticidad),
      backgroundColor: ["#ef4444", "#f59e0b", "#10b981", "#94a3b8"],
      borderWidth: 0,
      hoverOffset: 8,
    }],
  };

  const areaChartData = {
    labels: stats.porArea.map(([k]) => k.length > 16 ? k.slice(0, 14) + "…" : k),
    datasets: [{
      label: "Solicitudes",
      data: stats.porArea.map(([, v]) => v),
      backgroundColor: "rgba(37, 99, 235, 0.85)",
      borderRadius: 10,
      borderSkipped: false,
    }],
  };

  const estadoChartData = {
    labels: Object.keys(stats.porEstado),
    datasets: [{
      label: "Cantidad",
      data: Object.values(stats.porEstado),
      backgroundColor: ["#f59e0b", "#3b82f6", "#10b981"],
      borderRadius: 10,
      borderSkipped: false,
    }],
  };

  if (loading) return (
    <><Navbar /><div className="kpi-mant-container"><div className="kpi-mant-loading">Cargando métricas...</div></div><Footer /></>
  );

  return (
    <>
      <Navbar />
      <div className="kpi-mant-container">
        <header className="kpi-mant-header">
          <div>
            <h2 className="kpi-mant-title">KPIs & Métricas de Mantenimiento</h2>
            <p className="kpi-mant-sub">Indicadores de rendimiento en tiempo real</p>
          </div>
          <button className="mant-btn-action secondary" onClick={() => navigate("/mantenimiento")} style={{ alignSelf: "flex-start" }}>
            ← Tablero
          </button>
        </header>

        {/* STAT CARDS */}
        <div className="kpi-mant-cards">
          <KpiCard icon="🔧" title="Total Órdenes" value={stats.total} sub="Históricas" color="#6366f1" />
          <KpiCard icon="⏱️" title="MTTR" value={`${stats.mttr}h`} sub="Tiempo medio de reparación" color="#ef4444" />
          <KpiCard icon="📅" title="Preventivos" value={stats.preventivos} sub={`${stats.ratio}% del total`} color="#10b981" />
          <KpiCard icon="🚨" title="Correctivos" value={stats.correctivos} sub={`${100 - stats.ratio}% del total`} color="#f59e0b" />
          <KpiCard icon="✅" title="Finalizados" value={stats.finalizados} sub="Con cierre registrado" color="#3b82f6" />
          <KpiCard icon="📋" title="Planes Activos" value={stats.planesActivos} sub="Preventivos programados" color="#7c3aed" />
        </div>

        {/* RATIO BAR */}
        <div className="kpi-mant-ratio-card">
          <div className="kpi-ratio-header">
            <span className="kpi-ratio-title">Ratio Preventivo vs Correctivo</span>
            <span className="kpi-ratio-pct">{stats.ratio}% Preventivo</span>
          </div>
          <div className="kpi-ratio-track">
            <div className="kpi-ratio-fill kpi-ratio-prev" style={{ width: `${stats.ratio}%` }}>
              {stats.ratio > 10 && <span>Preventivos: {stats.preventivos}</span>}
            </div>
            <div className="kpi-ratio-fill kpi-ratio-corr" style={{ width: `${100 - stats.ratio}%` }}>
              {(100 - stats.ratio) > 10 && <span>Correctivos: {stats.correctivos}</span>}
            </div>
          </div>
          <div className="kpi-ratio-legend">
            <span><span className="kpi-dot prev"></span> Preventivos (objetivo: &gt;60%)</span>
            <span><span className="kpi-dot corr"></span> Correctivos</span>
          </div>
        </div>

        {/* CHARTS GRID */}
        <div className="kpi-mant-charts-grid">
          <div className="kpi-chart-box">
            <h3 className="kpi-chart-title">Solicitudes por Estado</h3>
            <div style={{ height: "220px" }}>
              <Bar data={estadoChartData} options={CHART_OPTS} />
            </div>
          </div>

          <div className="kpi-chart-box">
            <h3 className="kpi-chart-title">Impacto por Criticidad</h3>
            <div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Doughnut data={criticidadChartData} options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "right", labels: { font: { weight: "600" }, padding: 16 } },
                  tooltip: { backgroundColor: "#1e293b", padding: 12, cornerRadius: 10 },
                },
                cutout: "65%",
              }} />
            </div>
          </div>

          <div className="kpi-chart-box kpi-chart-wide">
            <h3 className="kpi-chart-title">Top Áreas Solicitantes</h3>
            <div style={{ height: "240px" }}>
              <Bar data={areaChartData} options={CHART_OPTS} />
            </div>
          </div>
        </div>

        {/* CRITICIDAD TABLE */}
        <div className="kpi-chart-box" style={{ marginTop: "24px" }}>
          <h3 className="kpi-chart-title">Detalle por Criticidad de Activo</h3>
          <table className="kpi-table">
            <thead>
              <tr><th>Criticidad</th><th>Solicitudes</th><th>% del Total</th><th>Distribución</th></tr>
            </thead>
            <tbody>
              {Object.entries(stats.porCriticidad).map(([crit, count]) => {
                const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : 0;
                const colorMap = { Alta: "#ef4444", Media: "#f59e0b", Baja: "#10b981" };
                const col = colorMap[crit] || "#94a3b8";
                return (
                  <tr key={crit}>
                    <td><span className={`v2-crit-badge crit-${crit.toLowerCase()}`}>{crit}</span></td>
                    <td style={{ fontWeight: "800" }}>{count}</td>
                    <td style={{ color: "#64748b" }}>{pct}%</td>
                    <td style={{ width: "40%" }}>
                      <div style={{ background: "#f1f5f9", borderRadius: "99px", height: "8px", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: "99px", transition: "width 0.5s ease" }}></div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Footer />
    </>
  );
}

function KpiCard({ icon, title, value, sub, color }) {
  return (
    <div className="kpi-card" style={{ "--kc": color }}>
      <div className="kpi-card-icon">{icon}</div>
      <div className="kpi-card-body">
        <span className="kpi-card-val">{value}</span>
        <span className="kpi-card-title-text">{title}</span>
        <span className="kpi-card-sub">{sub}</span>
      </div>
    </div>
  );
}
