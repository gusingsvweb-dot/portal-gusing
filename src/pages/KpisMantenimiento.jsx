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
  const [proyectos, setProyectos] = useState([]);
  const [repuestos, setRepuestos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: sol }, { data: pls }, { data: proy }, { data: rep }] = await Promise.all([
        supabase.from(st("solicitudes")).select(ss(
          "id, estado_id, tipo_solicitud_id, area_solicitante, created_at, calificacion, activos(criticidad, nombre)"
        )).eq("area_id", 1),
        supabase.from(st("planes_preventivos")).select("id, proxima_fecha, ultima_fecha"),
        supabase.from(st("proyectos_mant")).select("id, estado"),
        supabase.from(st("repuestos")).select("nombre, stock, stock_minimo"),
      ]);
      setSolicitudes(sol || []);
      setPlanes(pls || []);
      setProyectos(proy || []);
      setRepuestos(rep || []);
      setLoading(false);
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const isThisMonth = (d) => {
      if (!d) return false;
      const dt = new Date(d);
      return dt.getMonth() === currentMonth && dt.getFullYear() === currentYear;
    };
    const isThisYear = (d) => {
      if (!d) return false;
      return new Date(d).getFullYear() === currentYear;
    };

    // KPI 1: cumplimiento solicitudes de ticket del mes (tipo != 5, que es preventivo)
    const ticketsMes = solicitudes.filter(s => s.tipo_solicitud_id !== 5 && isThisMonth(s.created_at));
    const ticketsCerradosMes = ticketsMes.filter(s => [14, 15].includes(s.estado_id));
    const kpi1 = ticketsMes.length > 0 ? Math.round((ticketsCerradosMes.length / ticketsMes.length) * 100) : 0;

    // KPI 2: cumplimiento preventivos programados del mes (desde planes_preventivos)
    // Para medir correctamente los completados del mes actual, el total de preventivos esperados/realizados 
    // en este mes son aquellos con fecha de próxima intervención en este mes (pendientes) 
    // o con fecha de última intervención en este mes (ya completados).
    const prevMes = planes.filter(p => isThisMonth(p.proxima_fecha) || isThisMonth(p.ultima_fecha));
    const prevCompletadosMes = prevMes.filter(p => isThisMonth(p.ultima_fecha));
    const kpi2 = prevMes.length > 0 ? Math.round((prevCompletadosMes.length / prevMes.length) * 100) : 0;

    // KPI 3: proyectos (global — finalizados vs total)
    const proyFinalizados = proyectos.filter(p => p.estado === "Finalizado").length;
    const kpi3 = proyectos.length > 0 ? Math.round((proyFinalizados / proyectos.length) * 100) : 0;

    // KPI 4: promedio anual (tickets año + preventivos año + proyectos global) / 3
    const ticketsAño = solicitudes.filter(s => s.tipo_solicitud_id !== 5 && isThisYear(s.created_at));
    const ticketsAñoCerrados = ticketsAño.filter(s => [14, 15].includes(s.estado_id));
    const kpi1Año = ticketsAño.length > 0 ? Math.round((ticketsAñoCerrados.length / ticketsAño.length) * 100) : 0;

    const prevAño = planes.filter(p => isThisYear(p.proxima_fecha) || isThisYear(p.ultima_fecha));
    const prevAñoCompletados = prevAño.filter(p => isThisYear(p.ultima_fecha));
    const kpi2Año = prevAño.length > 0 ? Math.round((prevAñoCompletados.length / prevAño.length) * 100) : 0;

    const promedioAnual = Math.round((kpi1Año + kpi2Año + kpi3) / 3);

    // Calificación promedio
    const calificados = solicitudes.filter(s => s.estado_id === 15 && s.calificacion && !isNaN(parseFloat(s.calificacion)));
    const sumCalificacion = calificados.reduce((sum, s) => sum + parseFloat(s.calificacion), 0);
    const promedioCalificacion = calificados.length ? (sumCalificacion / calificados.length).toFixed(1) : "0.0";

    // Repuestos bajo stock (comparado contra stock_minimo configurable)
    const bajoStock = repuestos.filter(r => r.stock <= (r.stock_minimo ?? 5));

    // Charts
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
      kpi1, kpi2, kpi3, promedioAnual, promedioCalificacion,
      kpi1Detail: { total: ticketsMes.length, done: ticketsCerradosMes.length },
      kpi2Detail: { total: prevMes.length, done: prevCompletadosMes.length },
      kpi3Detail: { total: proyectos.length, done: proyFinalizados },
      bajoStock,
      porCriticidad, porArea, porEstado,
      totalSol: solicitudes.length,
    };
  }, [solicitudes, planes, proyectos, repuestos]);

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
          <KpiCard
            icon="🎫" title="Tickets (Mes)" value={`${stats.kpi1}%`}
            sub="Cumplimiento solicitudes" color="#ef4444"
            detail={stats.kpi1Detail}
          />
          <KpiCard
            icon="📅" title="Preventivos (Mes)" value={`${stats.kpi2}%`}
            sub="Preventivos programados" color="#10b981"
            detail={stats.kpi2Detail}
          />
          <KpiCard
            icon="🚀" title="Proyectos" value={`${stats.kpi3}%`}
            sub="Finalizados vs total" color="#3b82f6"
            detail={stats.kpi3Detail}
          />
          <KpiCard
            icon="📊" title="Promedio Anual" value={`${stats.promedioAnual}%`}
            sub="Promedio de los 3 indicadores" color="#8b5cf6"
          />
          <KpiCard
            icon="🏆" title="Calificación Prom." value={stats.promedioCalificacion}
            sub="Satisfacción del servicio" color="#eab308"
          />
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
        {stats.bajoStock.length > 0 && (
          <div className="kpi-chart-box kpi-alert-card" style={{ marginTop: "22px", marginBottom: "24px", borderLeft: "4px solid #f97316" }}>
            <h3 className="kpi-chart-title" style={{ color: "#c2410c" }}>⚠️ Alerta de Repuestos (Bajo Stock)</h3>
            <div className="kpi-stock-list">
              {stats.bajoStock.map((r, i) => (
                <div key={i} className="kpi-stock-item">
                  <span className="stock-name">{r.nombre}</span>
                  <span className="stock-val">{r.stock} / {r.stock_minimo ?? 5} mín.</span>
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
                const pct = stats.totalSol > 0 ? ((count / stats.totalSol) * 100).toFixed(1) : 0;
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

function KpiCard({ icon, title, value, sub, color, detail }) {
  return (
    <div className="kpi-card" style={{ "--kc": color }}>
      <div className="kpi-card-icon">{icon}</div>
      <div className="kpi-card-body">
        <span className="kpi-card-val">{value}</span>
        <span className="kpi-card-title-text">{title}</span>
        <span className="kpi-card-sub">{sub}</span>
        {detail && (
          <span className="kpi-card-detail">{detail.done} / {detail.total} completados</span>
        )}
      </div>
    </div>
  );
}
