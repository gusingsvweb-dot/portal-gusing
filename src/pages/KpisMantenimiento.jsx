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
  const [repuestosBajoStock, setRepuestosBajoStock] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: sol }, { data: pls }, { data: rep }] = await Promise.all([
        supabase.from(st("solicitudes")).select(ss(`
          id, estado_id, prioridad_id, area_solicitante, created_at, fecha_cierre,
          tipo_solicitud_id, estados(nombre), prioridades(nombre), activos(criticidad, nombre)
        `)).eq("area_id", 1),
        supabase.from(st("planes_preventivos")).select("id, activo"),
        supabase.from(st("repuestos_mant")).select("nombre, stock").lt("stock", 5)
      ]);
      setSolicitudes(sol || []);
      setPlanes(pls || []);
      setRepuestosBajoStock(rep || []);
      setLoading(false);
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const isThisMonth = (dateString) => {
      if (!dateString) return false;
      const d = new Date(dateString);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    };

    const isThisYear = (dateString) => {
      if (!dateString) return false;
      const d = new Date(dateString);
      return d.getFullYear() === currentYear;
    };

    const isTicket = (s) => s.tipos_solicitud?.nombre?.toLowerCase().includes("correctivo") || (!s.tipos_solicitud?.nombre?.toLowerCase().includes("preventivo") && !s.tipos_solicitud?.nombre?.toLowerCase().includes("mejora") && !s.tipos_solicitud?.nombre?.toLowerCase().includes("proyecto"));
    const isPrev = (s) => s.tipos_solicitud?.nombre?.toLowerCase().includes("preventivo");
    const isProj = (s) => s.tipos_solicitud?.nombre?.toLowerCase().includes("mejora") || s.tipos_solicitud?.nombre?.toLowerCase().includes("proyecto");

    // Mensual
    const ticketsThisMonth = solicitudes.filter(s => isThisMonth(s.created_at) && isTicket(s));
    const ticketsClosedThisMonth = ticketsThisMonth.filter(s => [14, 15].includes(s.estado_id));
    const ticketCompMonth = ticketsThisMonth.length ? Math.round((ticketsClosedThisMonth.length / ticketsThisMonth.length) * 100) : 100;

    const prevsThisMonth = solicitudes.filter(s => isThisMonth(s.created_at) && isPrev(s));
    const prevsClosedThisMonth = prevsThisMonth.filter(s => [14, 15].includes(s.estado_id));
    const prevCompMonth = prevsThisMonth.length ? Math.round((prevsClosedThisMonth.length / prevsThisMonth.length) * 100) : 100;

    const projsThisMonth = solicitudes.filter(s => isThisMonth(s.created_at) && isProj(s));
    const projsClosedThisMonth = projsThisMonth.filter(s => [14, 15].includes(s.estado_id));
    const projCompMonth = projsThisMonth.length ? Math.round((projsClosedThisMonth.length / projsThisMonth.length) * 100) : 100;

    // Anual
    const ticketsThisYear = solicitudes.filter(s => isThisYear(s.created_at) && isTicket(s));
    const ticketsClosedThisYear = ticketsThisYear.filter(s => [14, 15].includes(s.estado_id));
    const ticketCompYear = ticketsThisYear.length ? Math.round((ticketsClosedThisYear.length / ticketsThisYear.length) * 100) : 100;

    const prevsThisYear = solicitudes.filter(s => isThisYear(s.created_at) && isPrev(s));
    const prevsClosedThisYear = prevsThisYear.filter(s => [14, 15].includes(s.estado_id));
    const prevCompYear = prevsThisYear.length ? Math.round((prevsClosedThisYear.length / prevsThisYear.length) * 100) : 100;

    const projsThisYear = solicitudes.filter(s => isThisYear(s.created_at) && isProj(s));
    const projsClosedThisYear = projsThisYear.filter(s => [14, 15].includes(s.estado_id));
    const projCompYear = projsThisYear.length ? Math.round((projsClosedThisYear.length / projsThisYear.length) * 100) : 100;

    const promedioAnual = Math.round((ticketCompYear + prevCompYear + projCompYear) / 3);

    // Data for charts
    const porCriticidad = solicitudes.reduce((acc, s) => {
      const c = s.activos?.criticidad || "Sin equipo";
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

    return { 
      ticketCompMonth, prevCompMonth, projCompMonth, promedioAnual,
      porCriticidad, porArea, porEstado
    };
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
          <KpiCard icon="🎫" title="Tickets (Mes)" value={`${stats.ticketCompMonth}%`} sub="Cumplimiento mensual" color="#ef4444" />
          <KpiCard icon="📅" title="Preventivos (Mes)" value={`${stats.prevCompMonth}%`} sub="Cumplimiento mensual" color="#10b981" />
          <KpiCard icon="🚀" title="Proyectos (Mes)" value={`${stats.projCompMonth}%`} sub="Cumplimiento mensual" color="#3b82f6" />
          <KpiCard icon="📊" title="Promedio Anual" value={`${stats.promedioAnual}%`} sub="Global de indicadores" color="#8b5cf6" />
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

        {/* BAJO STOCK ALERT */}
        {repuestosBajoStock.length > 0 && (
          <div className="kpi-chart-box kpi-alert-card" style={{ marginBottom: "24px", borderLeft: "4px solid #f97316" }}>
            <h3 className="kpi-chart-title" style={{ color: "#c2410c" }}>⚠️ Alerta de Repuestos (Bajo Stock)</h3>
            <div className="kpi-stock-list">
              {repuestosBajoStock.map((r, i) => (
                <div key={i} className="kpi-stock-item">
                  <span className="stock-name">{r.nombre}</span>
                  <span className="stock-val">{r.stock} unid.</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CRITICIDAD TABLE */}
        <div className="kpi-chart-box" style={{ marginTop: "24px" }}>
          <h3 className="kpi-chart-title">Detalle por Criticidad de Equipo</h3>
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
