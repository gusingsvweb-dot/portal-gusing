import React, { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./PedidosFinalizados.css";

export default function PedidosFinalizados() {
  const [pedidos, setPedidos] = useState([]);
  const [selected, setSelected] = useState(null);

  // FILTROS
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroAsignado, setFiltroAsignado] = useState("todos");
  const [filtroProducto, setFiltroProducto] = useState("todos");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [listaProductos, setListaProductos] = useState([]);

  // =============================
  // Cargar pedidos finalizados
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
      .eq("estado_id", 12)
      .order("id", { ascending: false });

    if (error) {
      console.error("Error cargando finalizados:", error);
      return;
    }

    setPedidos(data || []);
  }

  // Cargar productos para filtro
  async function loadProductos() {
    const { data } = await supabase.from("productos").select("id, articulo");
    setListaProductos(data || []);
  }

  useEffect(() => {
    loadPedidos();
    loadProductos();
  }, []);

  // =============================
  // FILTRADO AVANZADO
  // =============================
  const pedidosFiltrados = pedidos.filter((p) => {
    const t = filtroTexto.toLowerCase();

    const coincideTexto =
      p.productos?.articulo?.toLowerCase().includes(t) ||
      p.clientes?.nombre?.toLowerCase().includes(t) ||
      String(p.op || "").includes(t) ||
      String(p.lote || "").includes(t);

    const coincideEstado =
      filtroEstado === "todos" ||
      String(p.estado_id) === String(filtroEstado);

    const coincideAsignado =
      filtroAsignado === "todos" || p.asignado_a === filtroAsignado;

    const coincideProducto =
      filtroProducto === "todos" ||
      p.productos?.articulo === filtroProducto;

    const fecha = p.fecha_entrega_bodega || p.fecha_liberacion_pt;
    const coincideFecha =
      (!fechaInicio || fecha >= fechaInicio) &&
      (!fechaFin || fecha <= fechaFin);

    return (
      coincideTexto &&
      coincideEstado &&
      coincideAsignado &&
      coincideProducto &&
      coincideFecha
    );
  });

  return (
    <>
      <Navbar />

      <div className="pc-wrapper">

        {/* ====================== */}
        {/* FILTROS AVANZADOS */}
        {/* ====================== */}
        <div className="pf-filters">
          <input
            type="text"
            className="pf-input"
            placeholder="Buscar por producto, cliente, OP o lote…"
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
          />

          {/* Fecha inicio */}
          <div className="pf-date-range">
            <label>Desde:</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>

          {/* Fecha fin */}
          <div className="pf-date-range">
            <label>Hasta:</label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>

          {/* Estado final */}
          <select
            className="pf-select"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
          >
            <option value="todos">Estado: Todos</option>
            <option value="11">Entregado a Bodega</option>
            <option value="12">Producción Finalizada</option>
          </select>

          {/* Responsable */}
          <select
            className="pf-select"
            value={filtroAsignado}
            onChange={(e) => setFiltroAsignado(e.target.value)}
          >
            <option value="todos">Responsable: Todos</option>
            <option value="produccion">Producción</option>
            <option value="microbiologia">Microbiología</option>
            <option value="acondicionamiento">Acondicionamiento</option>
            <option value="control_calidad">Control de Calidad</option>
            <option value="bodega">Bodega</option>
          </select>

          {/* Producto */}
          <select
            className="pf-select"
            value={filtroProducto}
            onChange={(e) => setFiltroProducto(e.target.value)}
          >
            <option value="todos">Producto: Todos</option>
            {listaProductos.map((prod) => (
              <option key={prod.id} value={prod.articulo}>
                {prod.articulo}
              </option>
            ))}
          </select>
        </div>

        {/* ====================== */}
        {/* LISTA IZQUIERDA */}
        {/* ====================== */}
        <div className="pc-list">
          <h2>📦 Pedidos Finalizados</h2>

          {pedidosFiltrados.map((p) => (
            <div
              key={p.id}
              className={`pc-item ${selected?.id === p.id ? "pc-item-selected" : ""}`}
              onClick={() => setSelected(p)}
            >
              <span className="pc-id-tag">#{p.id}</span>

              <h4>{p.productos?.articulo}</h4>
              <p><strong>Cliente:</strong> {p.clientes?.nombre}</p>
              <p><strong>Cantidad:</strong> {p.cantidad}</p>
              <p><strong>Fecha finalización:</strong> {p.fecha_entrega_bodega}</p>
            </div>
          ))}

          {pedidosFiltrados.length === 0 && (
            <p className="pc-empty">No hay pedidos que coincidan con el filtro.</p>
          )}
        </div>

        {/* ====================== */}
        {/* DETALLE DERECHA */}
        {/* ====================== */}
        {selected && (
          <div className="pc-detail fadeIn">
            <h3>📄 Detalle Finalizado</h3>

            <div className="pc-detail-grid">
              <p><strong>ID:</strong> #{selected.id}</p>
              <p><strong>Producto:</strong> {selected.productos?.articulo}</p>
              <p><strong>Cliente:</strong> {selected.clientes?.nombre}</p>
              <p><strong>Cantidad:</strong> {selected.cantidad}</p>
              <p><strong>Responsable final:</strong> {selected.asignado_a}</p>
              <p><strong>Finalizado el:</strong> {selected.fecha_entrega_bodega}</p>
            </div>

            <h3 style={{ marginTop: 25 }}>📚 Historial</h3>
            <div className="pc-historial">
              {renderHistorial(selected)}
            </div>
          </div>
        )}
      </div>

      <Footer />
    </>
  );
}

// ============================================
// HISTORIAL (idéntico al de Producción)
// ============================================
function renderHistorial(p) {
  if (!p) return null;
  const eventos = [];

  if (p.fecha_recepcion_cliente)
    eventos.push({ fecha: p.fecha_recepcion_cliente, titulo: "Recepción del pedido" });

  if (p.fecha_ingreso_produccion)
    eventos.push({ fecha: p.fecha_ingreso_produccion, titulo: "Ingreso a producción" });

  if (p.fecha_maxima_entrega || p.fecha_propuesta_entrega)
    eventos.push({ fecha: p.fecha_propuesta_entrega, titulo: "Asignación de fechas" });

  if (p.fecha_solicitud_materias_primas)
    eventos.push({ fecha: p.fecha_solicitud_materias_primas, titulo: "Solicitud de MP" });

  if (p.fecha_entrega_de_materias_primas_e_insumos)
    eventos.push({ fecha: p.fecha_entrega_de_materias_primas_e_insumos, titulo: "Entrega MP" });

  const autoCampos = [
    ["fecha_inicio_produccion", "Inicio producción"],
    ["fecha_entrada_mb", "Entrada MB"],
    ["fecha_salida_mb", "Salida MB"],
    ["fecha_inicio_acondicionamiento", "Inicio acondicionamiento"],
    ["fecha_fin_acondicionamiento", "Fin acondicionamiento"],
    ["fecha_liberacion_pt", "Liberación PT"],
    ["fecha_entrega_bodega", "Entrega a bodega"],
  ];

  autoCampos.forEach(([campo, titulo]) => {
    if (p[campo]) eventos.push({ fecha: p[campo], titulo });
  });

  eventos.sort((a, b) => (a.fecha > b.fecha ? -1 : 1));

  return eventos.map((ev, i) => (
    <div key={i} className="pc-hist-item">
      <p className="pc-hist-fecha">{ev.fecha}</p>
      <p className="pc-hist-titulo">{ev.titulo}</p>
    </div>
  ));
}
