// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
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
      .from("pedidos_produccion")
      .select(`
        *,
        productos ( articulo ),
        clientes ( nombre ),
        estados ( nombre )
      `)
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
      let changed = false;

      // 1. Producción Planificada
      if (p.produccion_planificada == null && p.fecha_maxima_entrega && p.fecha_ingreso_produccion) {
        const dias = Math.round(diffDias(p.fecha_ingreso_produccion, p.fecha_maxima_entrega));
        if (!isNaN(dias)) {
          up.produccion_planificada = dias;
          changed = true;
        }
      }

      // 2. Producción Real / Tiempo Entrega Cliente
      if (p.fecha_entrega_bodega && p.fecha_ingreso_produccion) {
        const dias = Math.round(diffDias(p.fecha_ingreso_produccion, p.fecha_entrega_bodega));
        if (!isNaN(dias)) {
          if (p.produccion_real == null) {
            up.produccion_real = dias;
            changed = true;
          }
          if (p.tiempo_entrega_cliente == null) {
            up.tiempo_entrega_cliente = dias;
            changed = true;
          }
        }
      }

      // 3. Días Análisis MB
      if (p.dias_analisis_mb == null && p.fecha_salida_mb && p.fecha_entrada_mb) {
        const dias = Math.round(diffDias(p.fecha_entrada_mb, p.fecha_salida_mb));
        if (!isNaN(dias)) {
          up.dias_analisis_mb = dias;
          changed = true;
        }
      }

      // 4. Días Acondicionamiento
      if (p.dias_acondicionamiento == null && p.fecha_fin_acondicionamiento && p.fecha_inicio_acondicionamiento) {
        const dias = Math.round(diffDias(p.fecha_inicio_acondicionamiento, p.fecha_fin_acondicionamiento));
        if (!isNaN(dias)) {
          up.dias_acondicionamiento = dias;
          changed = true;
        }
      }

      if (changed) {
        updates.push(supabase.from("pedidos_produccion").update(up).eq("id", p.id));
      }
    });

    if (updates.length > 0) {
      console.log(`🔄 Sincronizando ${updates.length} pedidos con nuevas métricas...`);
      await Promise.all(updates);
      // No recargamos aquí para evitar loop infinito, el usuario verá los calculados por JS en la tabla
    }
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
          <input
            type="text"
            placeholder="Buscar por producto o cliente…"
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
          />

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

          <select
            value={filtroAsignado}
            onChange={(e) => setFiltroAsignado(e.target.value)}
          >
            <option value="todos">Asignación: todos</option>
            <option value="produccion">Producción</option>
            <option value="bodega">Bodega</option>
            <option value="microbiologia">Microbiología</option>
            <option value="acondicionamiento">Acondicionamiento</option>
            <option value="control_calidad">Control de calidad</option>
            <option value="sin">Sin asignar</option>
          </select>

          <div className="dash-filter-dates">
            <div>
              <label>Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </div>
            <div>
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
            Limpiar filtros
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
          {/* Pedidos por mes */}
          <div className="dash-chart-card">
            <h3>📅 Pedidos recibidos por mes</h3>
            <Bar
              data={{
                labels: meses,
                datasets: [
                  {
                    label: "Pedidos recibidos",
                    data: porMes,
                    backgroundColor: "#2563eb",
                  },
                ],
              }}
              options={{
                plugins: { legend: { display: false } },
                responsive: true,
                maintainAspectRatio: false,
              }}
            />
          </div>

          {/* Finalizados por mes */}
          <div className="dash-chart-card">
            <h3>📦 Finalizados por mes</h3>
            <Line
              data={{
                labels: meses,
                datasets: [
                  {
                    label: "Pedidos finalizados",
                    data: finalizadosMes,
                    borderColor: "#16a34a",
                    backgroundColor: "rgba(22,163,74,0.2)",
                    tension: 0.3,
                  },
                ],
              }}
              options={{
                plugins: { legend: { display: false } },
                responsive: true,
                maintainAspectRatio: false,
              }}
            />
          </div>

          {/* Pedidos por estado */}
          <div className="dash-chart-card">
            <h3>🏭 Distribución por estado</h3>
            <Pie
              data={{
                labels: Object.keys(estadosConteo),
                datasets: [
                  {
                    data: Object.values(estadosConteo),
                    backgroundColor: [
                      "#2563eb",
                      "#16a34a",
                      "#f59e0b",
                      "#ef4444",
                      "#6366f1",
                      "#0ea5e9",
                      "#f97316",
                      "#22c55e",
                      "#a855f7",
                      "#e11d48",
                    ],
                  },
                ],
              }}
              options={{
                plugins: { legend: { position: "bottom" } },
                responsive: true,
                maintainAspectRatio: false,
              }}
            />
          </div>

          {/* Pedidos por área */}
          <div className="dash-chart-card">
            <h3>👥 Pedidos por área asignada</h3>
            <Bar
              data={{
                labels: Object.keys(asignacionConteo),
                datasets: [
                  {
                    label: "Pedidos",
                    data: Object.values(asignacionConteo),
                    backgroundColor: "#4b5563",
                  },
                ],
              }}
              options={{
                indexAxis: "y",
                plugins: { legend: { display: false } },
                responsive: true,
                maintainAspectRatio: false,
              }}
            />
          </div>

          {/* Tiempo promedio por etapa */}
          <div className="dash-chart-card">
            <h3>⏱️ Tiempo promedio por etapa (días)</h3>
            <Bar
              data={{
                labels: labelsEtapas,
                datasets: [
                  {
                    label: "Días promedio",
                    data: valoresEtapas,
                    backgroundColor: "#7c3aed",
                  },
                ],
              }}
              options={{
                plugins: { legend: { display: false } },
                responsive: true,
                maintainAspectRatio: false,
              }}
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
                  <th>Días MB</th>
                  <th>Días Acond.</th>
                  <th>¿A tiempo?</th>
                </tr>
              </thead>
              <tbody>
                {tablaPedidos.map((p) => {
                  const esFinalizadoTarde =
                    p.estado_id === 12 &&
                    p.fecha_entrega_bodega &&
                    p.fecha_maxima_entrega &&
                    p.fecha_entrega_bodega > p.fecha_maxima_entrega;

                  const cumplio =
                    p.estado_id === 12 && p.fecha_entrega_bodega
                      ? esFinalizadoTarde
                        ? "Tarde"
                        : "A tiempo"
                      : "-";

                  // Lógica para textos de métricas con estilos
                  const getMetricBadge = (valor, missingType) => {
                    if (valor != null) return <span className="metric-badge badge-value">{valor} d</span>;
                    if (missingType === "process") return <span className="metric-badge badge-process">En proceso</span>;
                    return <span className="metric-badge badge-missing">{missingType}</span>;
                  };

                  const txtPlan = (() => {
                    if (p.produccion_planificada != null) return getMetricBadge(p.produccion_planificada);
                    if (!p.fecha_maxima_entrega && !p.fecha_ingreso_produccion) return getMetricBadge(null, "process");
                    if (!p.fecha_maxima_entrega) return getMetricBadge(null, "Falta F. Máxima");
                    if (!p.fecha_ingreso_produccion) return getMetricBadge(null, "Falta F. Ingreso");
                    return getMetricBadge(null, "process");
                  })();

                  const txtReal = (() => {
                    if (p.produccion_real != null) return getMetricBadge(p.produccion_real);
                    if (!p.fecha_entrega_bodega && !p.fecha_ingreso_produccion) return getMetricBadge(null, "process");
                    if (!p.fecha_entrega_bodega) return getMetricBadge(null, "Falta F. Entrega");
                    if (!p.fecha_ingreso_produccion) return getMetricBadge(null, "Falta F. Ingreso");
                    return getMetricBadge(null, "process");
                  })();

                  const txtMB = (() => {
                    if (p.dias_analisis_mb != null) return getMetricBadge(p.dias_analisis_mb);
                    if (!p.fecha_salida_mb && !p.fecha_entrada_mb) return getMetricBadge(null, "process");
                    if (!p.fecha_salida_mb) return getMetricBadge(null, "Falta F. Salida MB");
                    if (!p.fecha_entrada_mb) return getMetricBadge(null, "Falta F. Entrada MB");
                    return getMetricBadge(null, "process");
                  })();

                  const txtAcond = (() => {
                    if (p.dias_acondicionamiento != null) return getMetricBadge(p.dias_acondicionamiento);
                    if (!p.fecha_fin_acondicionamiento && !p.fecha_inicio_acondicionamiento) return getMetricBadge(null, "process");
                    if (!p.fecha_fin_acondicionamiento) return getMetricBadge(null, "Falta F. Fin Acond.");
                    if (!p.fecha_inicio_acondicionamiento) return getMetricBadge(null, "Falta F. Inicio Acond.");
                    return getMetricBadge(null, "process");
                  })();

                  const getStateBadge = (estadoId, nombre) => {
                    let cls = "st-gray";
                    if (estadoId === 1) cls = "st-pend";
                    if (estadoId >= 2 && estadoId <= 5) cls = "st-prod";
                    if (estadoId >= 6 && estadoId <= 7) cls = "st-mb";
                    if (estadoId >= 8 && estadoId <= 9) cls = "st-acond";
                    if (estadoId === 10) cls = "st-qc";
                    if (estadoId === 12) cls = "st-final";

                    return <span className={`state-badge ${cls}`}>{nombre || `Estado ${estadoId}`}</span>;
                  };

                  return (
                    <tr key={p.id}>
                      <td>#{p.id}</td>
                      <td>{p.productos?.articulo}</td>
                      <td>{p.clientes?.nombre}</td>
                      <td>{getStateBadge(p.estado_id, p.estados?.nombre)}</td>
                      <td>{p.asignado_a || "Sin asignar"}</td>
                      <td>{p.fecha_recepcion_cliente || "-"}</td>
                      <td>{p.fecha_maxima_entrega || "-"}</td>
                      <td>{p.fecha_entrega_bodega || "-"}</td>
                      <td style={{ textAlign: "center" }}>{txtPlan}</td>
                      <td style={{ textAlign: "center" }}>{txtReal}</td>
                      <td style={{ textAlign: "center" }}>{txtMB}</td>
                      <td style={{ textAlign: "center" }}>{txtAcond}</td>
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
                })}

                {tablaPedidos.length === 0 && (
                  <tr>
                    <td colSpan="9" className="dash-empty">
                      No hay pedidos para los filtros seleccionados.
                    </td>
                  </tr>
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
