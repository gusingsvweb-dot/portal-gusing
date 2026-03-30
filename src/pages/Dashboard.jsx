// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase, st } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { useTheme } from "../context/ThemeContext";
import "./Dashboard.css";

// Charts
import {
  Chart as ChartJS,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

import { Bar, Line, Pie } from "react-chartjs-2";

// Registrar componentes de Chart.js UNA sola vez
ChartJS.register(
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  ArcElement,
  Tooltip,
  Legend
);

export default function Dashboard() {
  const [pedidos, setPedidos] = useState([]);

  // Filtros
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroAsignado, setFiltroAsignado] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // =============================
  // Cargar pedidos y sincronizar métricas
  // =============================
  async function loadPedidos() {
    const { data, error } = await supabase
      .from(st("pedidos_produccion"))
      .select(ss(`
        *,
        productos ( articulo ),
        clientes ( nombre ),
        estados ( nombre )
      `))
      .order("id", { ascending: false });

    if (error) {
      console.error("❌ Error cargando pedidos en Dashboard:", error);
      return;
    }

    // Sincronizar métricas en segundo plano si es necesario
    syncMetricas(data || []);
    setPedidos(data || []);
  }

  async function syncMetricas(lista) {
    const updates = [];
    lista.forEach((p) => {
      const up = {};
      const vals = getCalculatedValues(p);

      if (vals.plan !== null) up.produccion_planificada = vals.plan;
      if (vals.real !== null) up.produccion_real = vals.real;
      if (vals.entrega !== null) up.tiempo_entrega_cliente = vals.entrega;
      if (vals.mb !== null) up.dias_analisis_mb = vals.mb;
      if (vals.acond !== null) up.dias_acondicionamiento = vals.acond;
      if (vals.tMuertos !== null) up.tiempos_muertos = vals.tMuertos;

      // Verificar si hubo cambios reales
      let changed = false;
      for (const key in up) {
        if (up[key] !== p[key]) {
          changed = true;
          break;
        }
      }

      if (changed) {
        updates.push(supabase.from(st("pedidos_produccion")).update(up).eq("id", p.id));
      }
    });

    if (updates.length > 0) {
      console.log(`🔄 Sincronizando ${updates.length} pedidos con nuevas métricas...`);
      await Promise.all(updates);
      // No recargamos aquí para evitar loop infinito, el usuario verá los calculados por JS en la tabla
    }
  }

  function getCalculatedValues(p) {
    const diff = (start, end) => {
      if (!start || !end) return null;
      const s = new Date(start);
      const e = new Date(end);
      const d = Math.round((e - s) / (1000 * 60 * 60 * 24));
      return isNaN(d) ? null : d;
    };

    const plan = diff(p.fecha_ingreso_produccion, p.fecha_maxima_entrega);
    const real = diff(p.fecha_ingreso_produccion, p.fecha_entrega_bodega);
    // T. Entrega: Priorizar entrega_cliente, sino entrega_bodega (tiempo proceso)
    const entrega = diff(p.fecha_recepcion_cliente, p.fecha_entrega_cliente || p.fecha_entrega_bodega);
    const mb = diff(p.fecha_entrada_mb, p.fecha_salida_mb);
    const acond = diff(p.fecha_inicio_acondicionamiento, p.fecha_fin_acondicionamiento);

    let tMuertos = null;
    if (real !== null && plan !== null) {
      const val = real - plan;
      tMuertos = val > 0 ? val : 0;
    }

    return { plan, real, entrega, mb, acond, tMuertos };
  }

  useEffect(() => {
    loadPedidos();
  }, []);

  // =============================
  // Filtros combinados
  // =============================
  const pedidosFiltrados = useMemo(() => {
    const texto = filtroTexto.toLowerCase();
    return (pedidos || []).filter((p) => {
      const coincideTexto =
        !texto ||
        p.productos?.articulo?.toLowerCase().includes(texto) ||
        p.clientes?.nombre?.toLowerCase().includes(texto);

      const coincideEstado =
        filtroEstado === "todos" ||
        String(p.estado_id) === String(filtroEstado);

      const coincideAsignado =
        filtroAsignado === "todos" ||
        (!p.asignado_a && filtroAsignado === "sin") ||
        p.asignado_a === filtroAsignado;

      const fDesdeOk =
        !fechaDesde || (p.fecha_recepcion_cliente && p.fecha_recepcion_cliente >= fechaDesde);
      const fHastaOk =
        !fechaHasta || (p.fecha_recepcion_cliente && p.fecha_recepcion_cliente <= fechaHasta);

      return coincideTexto && coincideEstado && coincideAsignado && fDesdeOk && fHastaOk;
    });
  }, [pedidos, filtroTexto, filtroEstado, filtroAsignado, fechaDesde, fechaHasta]);

  // =============================
  // Utilidades
  // =============================
  function diffDias(f1, f2) {
    if (!f1 || !f2) return null;
    const d1 = new Date(f1);
    const d2 = new Date(f2);
    const ms = d2 - d1;
    return ms / (1000 * 60 * 60 * 24);
  }

  const hoy = new Date().toISOString().slice(0, 10);

  // =============================
  // KPIs (con filtros aplicados)
  // =============================
  const total = pedidosFiltrados.length;
  const finalizados = pedidosFiltrados.filter((p) => p.estado_id === 12);
  const enCurso = pedidosFiltrados.filter((p) => p.estado_id < 12);

  const vencidos = pedidosFiltrados.filter(
    (p) =>
      p.fecha_maxima_entrega &&
      p.estado_id !== 12 &&
      p.fecha_maxima_entrega < hoy
  );

  const finalizadosTarde = finalizados.filter(
    (p) =>
      p.fecha_entrega_bodega &&
      p.fecha_maxima_entrega &&
      p.fecha_entrega_bodega > p.fecha_maxima_entrega
  );

  // tiempo promedio total (ingreso prod → entrega bodega)
  let sumaDias = 0;
  let conteoDias = 0;
  finalizados.forEach((p) => {
    const dias = diffDias(p.fecha_ingreso_produccion, p.fecha_entrega_bodega);
    if (dias != null && !Number.isNaN(dias)) {
      sumaDias += dias;
      conteoDias++;
    }
  });
  const tiempoPromTotal = conteoDias ? (sumaDias / conteoDias).toFixed(1) : "-";

  // PROMEDIOS NUEVAS MÉTRICAS
  const avgPlanificada = (() => {
    const validos = pedidosFiltrados.filter(p => p.fecha_maxima_entrega && p.fecha_ingreso_produccion);
    if (validos.length === 0) return "-";
    const suma = validos.reduce((acc, p) => acc + (diffDias(p.fecha_ingreso_produccion, p.fecha_maxima_entrega) || 0), 0);
    return (suma / validos.length).toFixed(1);
  })();

  const avgReal = (() => {
    const validos = pedidosFiltrados.filter(p => p.fecha_entrega_bodega && p.fecha_ingreso_produccion);
    if (validos.length === 0) return "-";
    const suma = validos.reduce((acc, p) => acc + (diffDias(p.fecha_ingreso_produccion, p.fecha_entrega_bodega) || 0), 0);
    return (suma / validos.length).toFixed(1);
  })();

  const avgMB = (() => {
    const validos = pedidosFiltrados.filter(p => p.fecha_entrada_mb && p.fecha_salida_mb);
    if (validos.length === 0) return "-";
    const suma = validos.reduce((acc, p) => acc + (diffDias(p.fecha_entrada_mb, p.fecha_salida_mb) || 0), 0);
    return (suma / validos.length).toFixed(1);
  })();

  const avgAcond = (() => {
    const validos = pedidosFiltrados.filter(p => p.fecha_inicio_acondicionamiento && p.fecha_fin_acondicionamiento);
    if (validos.length === 0) return "-";
    const suma = validos.reduce((acc, p) => acc + (diffDias(p.fecha_inicio_acondicionamiento, p.fecha_fin_acondicionamiento) || 0), 0);
    return (suma / validos.length).toFixed(1);
  })();


  const cumplimiento =
    finalizados.length === 0
      ? "-"
      : (((finalizados.length - finalizadosTarde.length) / finalizados.length) * 100).toFixed(1);

  const porcentajeTarde =
    finalizados.length === 0
      ? "-"
      : ((finalizadosTarde.length / finalizados.length) * 100).toFixed(1);

  // =============================
  // Gráficas: por mes
  // =============================
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const porMes = new Array(12).fill(0);
  const finalizadosMes = new Array(12).fill(0);

  pedidosFiltrados.forEach((p) => {
    if (p.fecha_recepcion_cliente) {
      const m = new Date(p.fecha_recepcion_cliente).getMonth();
      porMes[m]++;
    }
    if (p.fecha_entrega_bodega) {
      const m = new Date(p.fecha_entrega_bodega).getMonth();
      finalizadosMes[m]++;
    }
  });

  // =============================
  // Gráfica: pedidos por estado
  // =============================
  const estadosConteo = {};
  pedidosFiltrados.forEach((p) => {
    const nombre = p.estados?.nombre || `Estado ${p.estado_id}`;
    estadosConteo[nombre] = (estadosConteo[nombre] || 0) + 1;
  });

  // =============================
  // Gráfica: pedidos por área asignada
  // =============================
  const asignacionConteo = {};
  pedidosFiltrados.forEach((p) => {
    const key = p.asignado_a || "Sin asignar";
    asignacionConteo[key] = (asignacionConteo[key] || 0) + 1;
  });

  // =============================
  // Tiempos promedio por etapa
  // =============================
  const ETAPAS = [
    ["fecha_ingreso_produccion", "Ingreso a Producción"],
    ["fecha_inicio_produccion", "Inicio Producción"],
    ["fecha_entrada_mb", "Entrada MB"],
    ["fecha_salida_mb", "Salida MB"],
    ["fecha_inicio_acondicionamiento", "Inicio Acondicionamiento"],
    ["fecha_fin_acondicionamiento", "Fin Acondicionamiento"],
    ["fecha_liberacion_pt", "Liberación PT"],
    ["fecha_entrega_bodega", "Entrega Bodega"],
  ];

  const sumaEtapa = new Array(ETAPAS.length).fill(0);
  const conteoEtapa = new Array(ETAPAS.length).fill(0);

  pedidosFiltrados.forEach((p) => {
    for (let i = 1; i < ETAPAS.length; i++) {
      const campoPrev = ETAPAS[i - 1][0];
      const campoAct = ETAPAS[i][0];
      const d = diffDias(p[campoPrev], p[campoAct]);
      if (d != null && d >= 0) {
        sumaEtapa[i] += d;
        conteoEtapa[i]++;
      }
    }
  });

  const labelsEtapas = ETAPAS.map(([, label]) => label);
  const valoresEtapas = sumaEtapa.map((s, i) =>
    conteoEtapa[i] ? Number((s / conteoEtapa[i]).toFixed(1)) : 0
  );

  // =============================
  // Rankings
  // =============================
  function topN(obj, n = 10) {
    return Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }

  // productos más pedidos
  const productosConteo = {};
  pedidosFiltrados.forEach((p) => {
    const nombre = p.productos?.articulo || "Sin producto";
    productosConteo[nombre] = (productosConteo[nombre] || 0) + 1;
  });

  // clientes con más pedidos
  const clientesConteo = {};
  pedidosFiltrados.forEach((p) => {
    const nombre = p.clientes?.nombre || "Sin cliente";
    clientesConteo[nombre] = (clientesConteo[nombre] || 0) + 1;
  });

  // productos con más demoras (solo finalizados tarde)
  const productosDemora = {};
  finalizadosTarde.forEach((p) => {
    const nombre = p.productos?.articulo || "Sin producto";
    productosDemora[nombre] = (productosDemora[nombre] || 0) + 1;
  });

  const topProductos = topN(productosConteo);
  const topClientes = topN(clientesConteo);
  const topDemoras = topN(productosDemora);

  // =============================
  // Tabla detalle (limit 100)
  // =============================
  const tablaPedidos = pedidosFiltrados.slice(0, 100);

  // =============================
  // Chart Configs (Theme-aware-ish)
  // =============================
  // =============================
  // Chart Configs (Theme-aware-ish)
  // =============================
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const chartTextColor = isDark ? "rgba(226, 232, 240, 0.8)" : "rgba(71, 85, 105, 0.9)";
  const chartGridColor = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)";

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
        labels: {
          color: chartTextColor,
          font: { weight: '600', size: 11 }
        }
      },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.9)",
        titleColor: "#fff",
        bodyColor: "#fff",
        padding: 10,
        borderRadius: 8,
      }
    },
    scales: {
      x: {
        grid: { color: chartGridColor, drawBorder: false },
        ticks: { color: chartTextColor, font: { size: 11, weight: '500' } }
      },
      y: {
        grid: { color: chartGridColor, drawBorder: false },
        ticks: { color: chartTextColor, font: { size: 11, weight: '500' } }
      }
    }
  };

  const pieOptions = {
    ...commonOptions,
    plugins: {
      ...commonOptions.plugins,
      legend: { display: true, position: "bottom", labels: { color: chartTextColor, padding: 15 } }
    },
    scales: undefined
  };

  // =============================
  // UI Helpers
  // =============================
  const getMetricBadge = (valor, missingType) => {
    if (valor != null) return <span className="metric-badge badge-value">{valor} d</span>;
    if (missingType === "process") return <span className="metric-badge badge-process">En proceso</span>;
    return <span className="metric-badge badge-missing">{missingType}</span>;
  };

  const getStateClass = (nombre) => {
    if (!nombre) return "st-gray";
    const n = nombre.toLowerCase();
    if (n.includes("pendiente")) return "st-pend";
    if (n.includes("producción") || n.includes("lote") || n.includes("materias") || n.includes("inicio")) return "st-prod";
    if (n.includes("mb") || n.includes("microbiología")) return "st-mb";
    if (n.includes("acondicionamiento")) return "st-acond";
    if (n.includes("pt") || n.includes("calidad") || n.includes("qc")) return "st-qc";
    if (n.includes("finalizada") || n.includes("bodega")) return "st-final";
    return "st-gray";
  };

  return (
    <>
      <Navbar />

      <div className="dash-wrapper">
        <div className="dash-header">
          <div>
            <h2>📊 Dashboard Estadístico</h2>
            <p className="dash-sub">
              Vista consolidada para Gerencia, Producción, Planeación y Atención al Cliente.
            </p>
          </div>
        </div>

        {/* ================= Filtros ================= */}
        <div className="dash-filters">
          <div className="dash-filter-group">
            <label>Búsqueda</label>
            <input
              type="text"
              placeholder="🔍 Producto o cliente…"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
            />
          </div>

          <div className="dash-filter-group">
            <label>Estado</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="todos">Todos los estados</option>
              <option value="1">Pendiente</option>
              <option value="2">Registro de lote</option>
              <option value="3">Asignación de fechas</option>
              <option value="4">Materias primas / insumos</option>
              <option value="5">Inicio producción</option>
              <option value="6">Entrada MB</option>
              <option value="7">Salida MB</option>
              <option value="8">Inicio acond.</option>
              <option value="9">Fin acond.</option>
              <option value="10">Liberación PT</option>
              <option value="11">Entrega bodega</option>
              <option value="12">Producción finalizada</option>
            </select>
          </div>

          <div className="dash-filter-group">
            <label>Asignación</label>
            <select
              value={filtroAsignado}
              onChange={(e) => setFiltroAsignado(e.target.value)}
            >
              <option value="todos">Cualquier área</option>
              <option value="produccion">Producción</option>
              <option value="bodega">Bodega</option>
              <option value="microbiologia">Microbiología</option>
              <option value="acondicionamiento">Acondicionamiento</option>
              <option value="control_calidad">Control de calidad</option>
              <option value="sin">Sin asignar</option>
            </select>
          </div>

          <div className="dash-filter-dates">
            <div className="dash-filter-group">
              <label>Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </div>
            <div className="dash-filter-group">
              <label>Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
              />
            </div>
          </div>

          <button
            className="dash-btn-clear"
            onClick={() => {
              setFiltroTexto("");
              setFiltroEstado("todos");
              setFiltroAsignado("todos");
              setFechaDesde("");
              setFechaHasta("");
            }}
          >
            Limpiar
          </button>
        </div>

        {/* ================= KPIs ================= */}
        <div className="dash-kpi-grid">
          <div className="dash-kpi kpi-total">
            <p className="kpi-title">Total pedidos</p>
            <p className="kpi-value">{total}</p>
            <p className="kpi-sub">Filtrados con los criterios actuales</p>
          </div>

          <div className="dash-kpi kpi-en-curso">
            <p className="kpi-title">En curso</p>
            <p className="kpi-value">{enCurso.length}</p>
          </div>

          <div className="dash-kpi kpi-finalizados">
            <p className="kpi-title">Finalizados</p>
            <p className="kpi-value">{finalizados.length}</p>
          </div>

          <div className="dash-kpi kpi-vencidos">
            <p className="kpi-title">Vencidos</p>
            <p className="kpi-value">{vencidos.length}</p>
          </div>

          <div className="dash-kpi kpi-tarde">
            <p className="kpi-title">Finalizados tarde</p>
            <p className="kpi-value">{finalizadosTarde.length}</p>
            <p className="kpi-sub">% {porcentajeTarde === "-" ? "-" : `${porcentajeTarde}%`}</p>
          </div>

          <div className="dash-kpi kpi-tiempo">
            <p className="kpi-title">Tiempo promedio total</p>
            <p className="kpi-value">
              {tiempoPromTotal === "-" ? "-" : `${tiempoPromTotal} días`}
            </p>
            <p className="kpi-sub">
              Ingreso a producción → entrega a bodega
            </p>
          </div>

          <div className="dash-kpi kpi-cumplimiento">
            <p className="kpi-title">% Cumplimiento</p>
            <p className="kpi-value">
              {cumplimiento === "-" ? "-" : `${cumplimiento}%`}
            </p>
            <p className="kpi-sub">Finalizados dentro de la fecha máxima</p>
          </div>

          <div className="dash-kpi kpi-total">
            <p className="kpi-title">Avg. Prod. Planificada</p>
            <p className="kpi-value">{avgPlanificada} <span style={{ fontSize: 14 }}>días</span></p>
          </div>

          <div className="dash-kpi kpi-total">
            <p className="kpi-title">Avg. Prod. Real</p>
            <p className="kpi-value">{avgReal} <span style={{ fontSize: 14 }}>días</span></p>
          </div>

          <div className="dash-kpi kpi-total">
            <p className="kpi-title">Avg. Análisis MB</p>
            <p className="kpi-value">{avgMB} <span style={{ fontSize: 14 }}>días</span></p>
          </div>

          <div className="dash-kpi kpi-total">
            <p className="kpi-title">Avg. Acondicionamiento</p>
            <p className="kpi-value">{avgAcond} <span style={{ fontSize: 14 }}>días</span></p>
          </div>
        </div>

        {/* ================= GRÁFICAS ================= */}
        <div className="dash-charts">
          <div className="dash-chart-card">
            <h3>📅 Pedidos recibidos por mes</h3>
            <Bar
              data={{
                labels: meses,
                datasets: [{ label: "Pedidos", data: porMes, backgroundColor: "#38bdf8" }],
              }}
              options={commonOptions}
            />
          </div>

          <div className="dash-chart-card">
            <h3>📦 Finalizados por mes</h3>
            <Line
              data={{
                labels: meses,
                datasets: [{
                  label: "Finalizados",
                  data: finalizadosMes,
                  borderColor: "#10b981",
                  backgroundColor: "rgba(16, 185, 129, 0.1)",
                  tension: 0.4,
                  fill: true
                }],
              }}
              options={commonOptions}
            />
          </div>

          <div className="dash-chart-card">
            <h3>🏭 Distribución por estado</h3>
            <Pie
              data={{
                labels: Object.keys(estadosConteo),
                datasets: [{
                  data: Object.values(estadosConteo),
                  backgroundColor: ["#38bdf8", "#10b981", "#f59e0b", "#ef4444", "#6366f1", "#0ea5e9", "#f97316", "#22c55e", "#a855f7", "#e11d48"],
                  borderWidth: 0
                }],
              }}
              options={pieOptions}
            />
          </div>

          <div className="dash-chart-card">
            <h3>👥 Pedidos por área asignada</h3>
            <Bar
              data={{
                labels: Object.keys(asignacionConteo),
                datasets: [{ label: "Pedidos", data: Object.values(asignacionConteo), backgroundColor: "#64748b" }],
              }}
              options={{ ...commonOptions, indexAxis: "y" }}
            />
          </div>

          <div className="dash-chart-card">
            <h3>⏱️ Tiempo promedio por etapa (días)</h3>
            <Bar
              data={{
                labels: labelsEtapas,
                datasets: [{ label: "Días promedio", data: valoresEtapas, backgroundColor: "#a855f7" }],
              }}
              options={commonOptions}
            />
          </div>
        </div>

        {/* ================= RANKINGS ================= */}
        <div className="dash-rankings">
          <div className="dash-ranking-card">
            <h3>⭐ Top productos más solicitados</h3>
            <ol>
              {topProductos.map(([nombre, cant]) => (
                <li key={nombre}>
                  <span>{nombre}</span>
                  <span className="rank-count">{cant}</span>
                </li>
              ))}
              {topProductos.length === 0 && <p className="dash-empty">Sin datos.</p>}
            </ol>
          </div>

          <div className="dash-ranking-card">
            <h3>👤 Clientes con más pedidos</h3>
            <ol>
              {topClientes.map(([nombre, cant]) => (
                <li key={nombre}>
                  <span>{nombre}</span>
                  <span className="rank-count">{cant}</span>
                </li>
              ))}
              {topClientes.length === 0 && <p className="dash-empty">Sin datos.</p>}
            </ol>
          </div>

          <div className="dash-ranking-card">
            <h3>⚠️ Productos con más demoras</h3>
            <ol>
              {topDemoras.map(([nombre, cant]) => (
                <li key={nombre}>
                  <span>{nombre}</span>
                  <span className="rank-count">{cant}</span>
                </li>
              ))}
              {topDemoras.length === 0 && (
                <p className="dash-empty">No hay demoras registradas en el filtro actual.</p>
              )}
            </ol>
          </div>
        </div>

        {/* ================= TABLA DETALLE ================= */}
        <div className="dash-table-card">
          <div className="dash-table-header">
            <h3>📃 Detalle de pedidos (máx. 100)</h3>
            <span className="dash-table-count">{tablaPedidos.length} registros</span>
          </div>

          <div className="dash-table-wrapper">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Producto</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Asignado a</th>
                  <th>Recepción</th>
                  <th>F. máxima</th>
                  <th>Entrega bodega</th>
                  <th>Prod. Planificada</th>
                  <th>Prod. Real</th>
                  <th>T. Entrega</th>
                  <th>Días MB</th>
                  <th>Días Acond.</th>
                  <th>T. Muertos</th>
                  <th>¿A tiempo?</th>
                </tr>
              </thead>
              <tbody>
                {tablaPedidos.length === 0 ? (
                  <tr>
                    <td colSpan="15" className="dash-empty">
                      No hay pedidos para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  tablaPedidos.map((p) => {
                    const c = getCalculatedValues(p);
                    const cumplio = p.fecha_entrega_bodega && p.fecha_maxima_entrega
                      ? (p.fecha_entrega_bodega <= p.fecha_maxima_entrega ? "A tiempo" : "Tarde")
                      : "-";

                    return (
                      <tr key={p.id}>
                        <td style={{ fontWeight: "600", color: "var(--text-main)" }}>#{p.id}</td>
                        <td style={{ fontWeight: "500", color: "var(--text-main)" }}>{p.productos?.articulo || "-"}</td>
                        <td>{p.clientes?.nombre || "-"}</td>
                        <td>
                          <span className={`state-badge ${getStateClass(p.estados?.nombre)}`}>
                            {p.estados?.nombre || "Pendiente"}
                          </span>
                        </td>
                        <td>{p.asignado_a || "Sin asignar"}</td>
                        <td>{p.fecha_recepcion_cliente || "-"}</td>
                        <td>{p.fecha_maxima_entrega || "-"}</td>
                        <td>{p.fecha_entrega_bodega || "-"}</td>
                        <td style={{ textAlign: "center" }}>{getMetricBadge(c.plan, "process")}</td>
                        <td style={{ textAlign: "center" }}>{getMetricBadge(c.real, "process")}</td>
                        <td style={{ textAlign: "center" }}>{getMetricBadge(c.entrega, "process")}</td>
                        <td style={{ textAlign: "center" }}>{getMetricBadge(c.mb, "process")}</td>
                        <td style={{ textAlign: "center" }}>{getMetricBadge(c.acond, "process")}</td>
                        <td style={{ textAlign: "center" }}>{getMetricBadge(c.tMuertos, "-")}</td>
                        <td
                          className={
                            cumplio === "A tiempo"
                              ? "badge-ok"
                              : cumplio === "Tarde"
                                ? "badge-late"
                                : ""
                          }
                        >
                          {cumplio}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}

