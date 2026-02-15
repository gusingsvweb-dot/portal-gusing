// src/pages/Gerencia.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./Gerencia.css";

export default function Gerencia() {
  const [pedidos, setPedidos] = useState([]);
  const [selected, setSelected] = useState(null);

  // Filtros
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroAsignado, setFiltroAsignado] = useState("todos");
  const [fechaRecDesde, setFechaRecDesde] = useState("");
  const [fechaRecHasta, setFechaRecHasta] = useState("");
  const [fechaEntDesde, setFechaEntDesde] = useState("");
  const [fechaEntHasta, setFechaEntHasta] = useState("");

  // =============================
  // Cargar TODOS los pedidos
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
      console.error("❌ Error cargando pedidos (Gerencia):", error);
      return;
    }

    setPedidos(data || []);
  }

  useEffect(() => {
    loadPedidos();
  }, []);

  // =============================
  // Filtrado avanzado
  // =============================
  const pedidosFiltrados = pedidos.filter((p) => {
    const texto = filtroTexto.toLowerCase();

    const coincideTexto =
      !texto ||
      p.productos?.articulo?.toLowerCase().includes(texto) ||
      p.clientes?.nombre?.toLowerCase().includes(texto);

    const coincideEstado =
      filtroEstado === "todos" ||
      String(p.estado_id) === String(filtroEstado);

    const coincideAsignado =
      filtroAsignado === "todos" ||
      (filtroAsignado === "sin" && !p.asignado_a) ||
      (filtroAsignado !== "sin" &&
        p.asignado_a &&
        p.asignado_a.toLowerCase() === filtroAsignado.toLowerCase());

    // Fechas de recepción
    const rec = p.fecha_recepcion_cliente || "";
    const coincideRecDesde = !fechaRecDesde || rec >= fechaRecDesde;
    const coincideRecHasta = !fechaRecHasta || rec <= fechaRecHasta;

    // Fechas de entrega a bodega
    const ent = p.fecha_entrega_bodega || "";
    const coincideEntDesde = !fechaEntDesde || ent >= fechaEntDesde;
    const coincideEntHasta = !fechaEntHasta || ent <= fechaEntHasta;

    return (
      coincideTexto &&
      coincideEstado &&
      coincideAsignado &&
      coincideRecDesde &&
      coincideRecHasta &&
      coincideEntDesde &&
      coincideEntHasta
    );
  });

  // =============================
  // Resumen rápido (según filtros)
  // =============================
  const hoy = new Date().toISOString().slice(0, 10);

  const totalPedidos = pedidosFiltrados.length;
  const totalFinalizados = pedidosFiltrados.filter(
    (p) => p.estado_id === 12
  ).length;
  const totalEnCurso = pedidosFiltrados.filter(
    (p) => p.estado_id < 12
  ).length;

  const vencidosSinFinalizar = pedidosFiltrados.filter((p) => {
    return (
      p.fecha_maxima_entrega &&
      p.estado_id !== 12 &&
      p.fecha_maxima_entrega < hoy
    );
  }).length;

  const finalizadosFueraDeFecha = pedidosFiltrados.filter((p) => {
    return (
      p.estado_id === 12 &&
      p.fecha_maxima_entrega &&
      p.fecha_entrega_bodega &&
      p.fecha_entrega_bodega > p.fecha_maxima_entrega
    );
  }).length;

  return (
    <>
      <Navbar />

      <div className="pc-wrapper">
        {/* COLUMNA IZQUIERDA */}
        <div className="pc-list">
          <div className="ge-header">
            <h2>📊 Panel Gerencia</h2>
            <span className="ge-subtitle">
              Vista global de todos los pedidos
            </span>
          </div>

          {/* RESUMEN */}
          <div className="ge-summary-grid">
            <div className="ge-summary-card">
              <p className="ge-summary-label">Total pedidos</p>
              <p className="ge-summary-value">{totalPedidos}</p>
            </div>
            <div className="ge-summary-card ge-ok">
              <p className="ge-summary-label">En curso</p>
              <p className="ge-summary-value">{totalEnCurso}</p>
            </div>
            <div className="ge-summary-card ge-finished">
              <p className="ge-summary-label">Finalizados</p>
              <p className="ge-summary-value">{totalFinalizados}</p>
            </div>
            <div className="ge-summary-card ge-alert">
              <p className="ge-summary-label">Vencidos sin finalizar</p>
              <p className="ge-summary-value">{vencidosSinFinalizar}</p>
            </div>
            <div className="ge-summary-card ge-warning">
              <p className="ge-summary-label">Finalizados fuera de fecha</p>
              <p className="ge-summary-value">{finalizadosFueraDeFecha}</p>
            </div>
          </div>

          {/* FILTROS */}
          <div className="pc-filters">
            <input
              type="text"
              className="pc-filter-input"
              placeholder="🔍 Buscar por producto o cliente…"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
            />

            <div className="ge-filters-row">
              <select
                className="pc-select"
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
                className="pc-select"
                value={filtroAsignado}
                onChange={(e) => setFiltroAsignado(e.target.value)}
              >
                <option value="todos">Asignado: todos</option>
                <option value="produccion">Producción</option>
                <option value="bodega">Bodega</option>
                <option value="microbiologia">Microbiología</option>
                <option value="acondicionamiento">Acondicionamiento</option>
                <option value="control_calidad">Control de Calidad</option>
                <option value="sin">Sin asignar</option>
              </select>
            </div>

            {/* Fechas de recepción */}
            <div className="pc-filter-dates">
              <div>
                <label>Recepción desde</label>
                <input
                  type="date"
                  value={fechaRecDesde}
                  onChange={(e) => setFechaRecDesde(e.target.value)}
                />
              </div>
              <div>
                <label>Recepción hasta</label>
                <input
                  type="date"
                  value={fechaRecHasta}
                  onChange={(e) => setFechaRecHasta(e.target.value)}
                />
              </div>
            </div>

            {/* Fechas de entrega */}
            <div className="pc-filter-dates">
              <div>
                <label>Entrega desde</label>
                <input
                  type="date"
                  value={fechaEntDesde}
                  onChange={(e) => setFechaEntDesde(e.target.value)}
                />
              </div>
              <div>
                <label>Entrega hasta</label>
                <input
                  type="date"
                  value={fechaEntHasta}
                  onChange={(e) => setFechaEntHasta(e.target.value)}
                />
              </div>
            </div>

            <button
              className="pc-btn-secondary"
              onClick={() => {
                setFiltroTexto("");
                setFiltroEstado("todos");
                setFiltroAsignado("todos");
                setFechaRecDesde("");
                setFechaRecHasta("");
                setFechaEntDesde("");
                setFechaEntHasta("");
              }}
            >
              Limpiar filtros
            </button>
          </div>

          {/* LISTA */}
          <div className="pc-list-content">
            {pedidosFiltrados.map((p) => (
              <div
                key={p.id}
                className={`pc-item ${
                  selected?.id === p.id ? "pc-item-selected" : ""
                }`}
                onClick={() => setSelected(p)}
              >
                <span className="pc-id-tag">#{p.id}</span>

                <div className="pc-item-header">
                  <h4>{p.productos?.articulo}</h4>
                  <span className={`pc-chip estado-${p.estado_id}`}>
                    {p.estados?.nombre}
                  </span>
                </div>

                <p>
                  <strong>Cliente:</strong> {p.clientes?.nombre}
                </p>
                <p>
                  <strong>Cantidad:</strong> {p.cantidad}
                </p>
                <p>
                  <strong>Recepción:</strong> {p.fecha_recepcion_cliente}
                </p>
                <p style={{ fontSize: 12, marginTop: 4, color: "#475569" }}>
                  <strong>Asignado a:</strong> {p.asignado_a || "Sin asignar"}
                </p>
              </div>
            ))}

            {pedidosFiltrados.length === 0 && (
              <p className="pc-empty">No hay pedidos que coincidan con los filtros.</p>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: DETALLE */}
        {selected && (
          <div className="pc-detail fadeIn">
            <h3>📄 Detalle del Pedido</h3>

            <div className="pc-detail-grid">
              <p>
                <strong>ID:</strong> #{selected.id}
              </p>
              <p>
                <strong>Producto:</strong> {selected.productos?.articulo}
              </p>
              <p>
                <strong>Cliente:</strong> {selected.clientes?.nombre}
              </p>
              <p>
                <strong>Cantidad:</strong> {selected.cantidad}
              </p>
              <p>
                <strong>Estado:</strong>{" "}
                <span className={`pc-chip estado-${selected.estado_id}`}>
                  {selected.estados?.nombre}
                </span>
              </p>
              <p>
                <strong>Asignado a:</strong>{" "}
                {selected.asignado_a || "Sin asignar"}
              </p>
              <p>
                <strong>Recepción cliente:</strong>{" "}
                {selected.fecha_recepcion_cliente || "-"}
              </p>
              <p>
                <strong>Ingreso producción:</strong>{" "}
                {selected.fecha_ingreso_produccion || "-"}
              </p>
              <p>
                <strong>Fecha máx. entrega:</strong>{" "}
                {selected.fecha_maxima_entrega || "-"}
              </p>
              <p>
                <strong>Fecha propuesta:</strong>{" "}
                {selected.fecha_propuesta_entrega || "-"}
              </p>
              <p>
                <strong>Entrega a bodega:</strong>{" "}
                {selected.fecha_entrega_bodega || "-"}
              </p>
            </div>

            {/* HISTORIAL */}
            <h3 style={{ marginTop: 25 }}>📚 Historial del Pedido</h3>
            <div className="pc-historial">{renderHistorial(selected)}</div>
          </div>
        )}
      </div>

      <Footer />
    </>
  );
}

// ==========================
// Historial reutilizable
// ==========================
function renderHistorial(p) {
  if (!p) return null;

  const eventos = [];

  if (p.fecha_recepcion_cliente)
    eventos.push({
      fecha: p.fecha_recepcion_cliente,
      titulo: "Recepción del pedido",
      detalle: "Pedido ingresado por Atención al Cliente",
    });

  if (p.fecha_ingreso_produccion)
    eventos.push({
      fecha: p.fecha_ingreso_produccion,
      titulo: "Ingreso a producción",
      detalle: "",
    });

  if (p.fecha_maxima_entrega || p.fecha_propuesta_entrega)
    eventos.push({
      fecha: p.fecha_propuesta_entrega || p.fecha_maxima_entrega,
      titulo: "Asignación de fechas",
      detalle: `Máxima: ${p.fecha_maxima_entrega || "-"}, Propuesta: ${
        p.fecha_propuesta_entrega || "-"
      }`,
    });

  if (p.fecha_solicitud_materias_primas)
    eventos.push({
      fecha: p.fecha_solicitud_materias_primas,
      titulo: "Solicitud de materias primas",
      detalle: "Solicitud enviada a Bodega",
    });

  if (p.fecha_entrega_de_materias_primas_e_insumos)
    eventos.push({
      fecha: p.fecha_entrega_de_materias_primas_e_insumos,
      titulo: "Entrega de materias primas",
      detalle: "Insumos entregados por Bodega",
    });

  const autoCampos = [
    ["fecha_inicio_produccion", "Inicio de producción"],
    ["fecha_entrada_mb", "Entrada MB"],
    ["fecha_salida_mb", "Salida MB"],
    ["fecha_inicio_acondicionamiento", "Inicio acondicionamiento"],
    ["fecha_fin_acondicionamiento", "Fin acondicionamiento"],
    ["fecha_liberacion_pt", "Liberación PT"],
    ["fecha_entrega_bodega", "Entrega a bodega"],
  ];

  autoCampos.forEach(([campo, titulo]) => {
    if (p[campo]) {
      eventos.push({ fecha: p[campo], titulo, detalle: "" });
    }
  });

  // Orden cronológico descendente
  eventos.sort((a, b) => (a.fecha > b.fecha ? -1 : 1));

  if (eventos.length === 0)
    return <p className="pc-empty">Aún no hay historial disponible.</p>;

  return eventos.map((ev, i) => (
    <div key={i} className="pc-hist-item">
      <p className="pc-hist-fecha">{ev.fecha}</p>
      <p className="pc-hist-titulo">{ev.titulo}</p>
      {ev.detalle && <p className="pc-hist-detalle">{ev.detalle}</p>}
    </div>
  ));
}
