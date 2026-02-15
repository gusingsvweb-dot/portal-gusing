import React, { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar.jsx";
import Footer from "../components/Footer.jsx";
import "./PedidosEnCurso.css";
import SkeletonPedido from "../components/SkeletonPedido.jsx";
import "../components/SkeletonPedido.css";
import LoaderOverlay from "../components/LoaderOverlay.jsx";
import "../components/LoaderOverlay.css";

export default function PedidosEnCurso() {
  const [pedidosRaw, setPedidosRaw] = useState([]); // Todo lo que viene de BD
  const [pedidos, setPedidos] = useState([]);       // Filtrados
  const [selected, setSelected] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [cargandoPantalla, setCargandoPantalla] = useState(false);

  const [observaciones, setObservaciones] = useState([]);
  const [nuevaObs, setNuevaObs] = useState("");
  const [usuarioActual, setUsuarioActual] = useState(null);

  // Filtros
  const [searchCliente, setSearchCliente] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");

  // Paginación
  const [page, setPage] = useState(1);
  const pageSize = 8;

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("usuarioActual"));
    setUsuarioActual(user);
    cargarPedidos();

    // Auto-refresh cada 10 segundos
    const interval = setInterval(() => {
      cargarPedidos(false); // false: no resetear selección
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Recalcular lista filtrada cuando cambien datos o filtros
  useEffect(() => {
    aplicarFiltros();
  }, [pedidosRaw, searchCliente, fechaDesde, fechaHasta]);

  // Calcular página visible
  const totalPages = Math.max(1, Math.ceil(pedidos.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const visiblePedidos = pedidos.slice(startIndex, startIndex + pageSize);

    // =======================
    // LOADER  
    // =======================
    function activarLoader() {
    setCargandoPantalla(true);
    setCargando(true);
    }

  // =======================
  // Cargar pedidos de BD
  // =======================
  async function cargarPedidos(resetSelection = true) {
    setCargandoPantalla(true);   // 🔵 Activa loader

    const { data, error } = await supabase
      .from("pedidos_produccion")
      .select(`
        *,
        productos ( articulo ),
        clientes ( nombre ),
        estados ( nombre )
      `)
      .lt("estado_id", 13)
      .order("id", { ascending: false });

    if (error) {
      console.error("❌ Error cargando pedidos:", error);
      return;
    }

    setPedidosRaw(data || []);
    setCargando(false);
    setCargandoPantalla(false);

    if (resetSelection) {
      setSelected(null);
      setObservaciones([]);
    }
  }

  function renderHistorial() {
  if (!selected) return null;

  const eventos = [];

  // Estado 1: recepción
  if (selected.fecha_recepcion_cliente) {
    eventos.push({
      fecha: selected.fecha_recepcion_cliente,
      titulo: "Recepción del pedido",
      detalle: "Pedido ingresado por Atención al Cliente",
    });
  }

  // Estado 2: registro de lote
  if (selected.op || selected.lote || selected.fecha_vencimiento) {
    eventos.push({
      fecha: selected.fecha_ingreso_produccion,
      titulo: "Registro de lote",
      detalle: `OP: ${selected.op || "-"}, Lote: ${selected.lote || "-"}, Vence: ${selected.fecha_vencimiento || "-"}`,
    });
  }

  // Estado 3: fechas
  if (selected.fecha_maxima_entrega || selected.fecha_propuesta_entrega) {
    eventos.push({
      fecha: selected.fecha_propuesta_entrega,
      titulo: "Asignación de fechas",
      detalle: `Máxima: ${selected.fecha_maxima_entrega}, Propuesta: ${selected.fecha_propuesta_entrega}`,
    });
  }

  // Estado 4: materias primas
  if (selected.fecha_solicitud_materias_primas) {
    eventos.push({
      fecha: selected.fecha_solicitud_materias_primas,
      titulo: "Solicitud de materias primas",
      detalle: "Solicitud enviada a Bodega",
    });
  }

  if (selected.fecha_entrega_de_materias_primas_e_insumos) {
    eventos.push({
      fecha: selected.fecha_entrega_de_materias_primas_e_insumos,
      titulo: "Entrega de materias primas",
      detalle: "Insumos entregados por Bodega",
    });
  }

  // Estados automáticos
  const autoFechas = [
    ["fecha_inicio_produccion", "Inicio de producción"],
    ["fecha_entrada_mb", "Entrada MB"],
    ["fecha_salida_mb", "Salida MB"],
    ["fecha_inicio_acondicionamiento", "Inicio de acondicionamiento"],
    ["fecha_fin_acondicionamiento", "Fin de acondicionamiento"],
    ["fecha_liberacion_pt", "Liberación PT"],
    ["fecha_entrega_bodega", "Entrega a bodega"],
  ];

  autoFechas.forEach(([campo, titulo]) => {
    if (selected[campo]) {
      eventos.push({
        fecha: selected[campo],
        titulo,
        detalle: "",
      });
    }
  });

  // Ordenar por fecha
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


  // =======================
  // Filtros en memoria
  // =======================
        function aplicarFiltros() {
        let data = [...pedidosRaw];

        // 🔍 Buscar por cliente
        if (searchCliente.trim()) {
            const term = searchCliente.toLowerCase();
            data = data.filter((p) =>
            p.clientes?.nombre?.toLowerCase().includes(term)
            );
        }

        // 📅 Filtro por fecha desde
        if (fechaDesde) {
            data = data.filter(
            (p) => p.fecha_recepcion_cliente >= fechaDesde
            );
        }

        // 📅 Filtro por fecha hasta
        if (fechaHasta) {
            data = data.filter(
            (p) => p.fecha_recepcion_cliente <= fechaHasta
            );
        }

        // 🎛 FILTRO POR ESTADO
        if (estadoFiltro !== "") {
            data = data.filter(
            (p) => String(p.estado_id) === String(estadoFiltro)
            );
        }

        setPedidos(data);
        setPage(1);
        }


  function limpiarFiltros() {
    setSearchCliente("");
    setFechaDesde("");
    setFechaHasta("");
  }

  // =======================
  // Observaciones
  // =======================
  async function cargarObservaciones(idPedido) {
    const { data, error } = await supabase
      .from("observaciones_pedido")
      .select("*")
      .eq("pedido_id", idPedido)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("❌ Error cargando observaciones:", error);
      return;
    }

    setObservaciones(data || []);
  }

  async function seleccionarPedido(p) {
    setSelected(p);
    await cargarObservaciones(p.id);
  }

  async function agregarObservacion() {
    if (!nuevaObs.trim() || !selected || !usuarioActual) return;

    const obs = {
      pedido_id: selected.id,
      usuario: usuarioActual.usuario, // viene de tu AuthContext / localStorage
      observacion: nuevaObs.trim(),
    };

    const { error } = await supabase
      .from("observaciones_pedido")
      .insert([obs]);

    if (error) {
      console.error("❌ ERROR insertando observación:", error);
      return;
    }

    setNuevaObs("");
    cargarObservaciones(selected.id);
  }

  // =======================
  // Render
  // =======================
  return (
    <>
    {cargandoPantalla && <LoaderOverlay />}
      <Navbar />

      <div className="pc-wrapper">

        {/* COLUMNA IZQUIERDA: LISTA + FILTROS */}
        <div className="pc-list">
          <h2>📦 Pedidos en Curso</h2>

          <div className="pc-filters">
  <input
    type="text"
    placeholder="🔍 Buscar por cliente…"
    value={searchCliente}
    onChange={(e) => setSearchCliente(e.target.value)}
  />

  {/* FILTRO DE ESTADO */}
        <select
            value={estadoFiltro}
            onChange={(e) => {
            setEstadoFiltro(e.target.value);
            activarLoader();
            }}

            className="pc-select"
        >
              <option value="">Todos los estados</option>
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
            {/* Agrega más opciones según tu catálogo de estados */}
        </select>

        <div className="pc-filter-dates">
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

        <button className="pc-btn-secondary" onClick={limpiarFiltros}>
            Limpiar filtros
        </button>
        </div>

        {/* Lista con estados */}
        <div className="pc-list-content">

        {cargando ? (
            <>
            <SkeletonPedido />
            <SkeletonPedido />
            <SkeletonPedido />
            </>
        ) : visiblePedidos.length === 0 ? (
            <p className="pc-empty">No hay pedidos que coincidan con el filtro.</p>
        ) : (
            visiblePedidos.map((p) => (
            <div
                key={p.id}
                className={`pc-item ${selected?.id === p.id ? "pc-item-selected" : ""}`}
                onClick={() => seleccionarPedido(p)}
            >
              <span className="pc-id-tag">#{p.id}</span>
                <div className="pc-item-header">
                <h4>{p.productos?.articulo}</h4>
                <span className={`pc-estado estado-${p.estado_id}`}>
                    {p.estados?.nombre || "En curso"}
                </span>
                </div>

                <p><strong>Cliente:</strong> {p.clientes?.nombre}</p>
                <p><strong>Cantidad:</strong> {p.cantidad}</p>
                <p><strong>Fecha:</strong> {p.fecha_recepcion_cliente}</p>
            </div>
            ))
        )}

        </div>


          {/* Paginación */}
          {pedidos.length > pageSize && (
            <div className="pc-pagination">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ◀ Anterior
              </button>
              <span>
                Página {page} de {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente ▶
              </button>
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: DETALLE */}
        {selected && (
          <div className="pc-detail fadeIn">
            <h3>📄 Detalle del Pedido</h3>

            <div className="pc-detail-grid">
              <p><strong>Producto:</strong> {selected.productos?.articulo}</p>
              <p><strong>Cliente:</strong> {selected.clientes?.nombre}</p>
              <p><strong>Cantidad:</strong> {selected.cantidad}</p>
              <p><strong>Fecha recepción:</strong> {selected.fecha_recepcion_cliente}</p>
              <p>
                <strong>Estado:</strong>{" "}
                <span className={`pc-estado estado-${selected.estado_id}`}>
                  {selected.estados?.nombre || "En curso"}
                </span>
              </p>
            </div>

            {/* Historial de observaciones */}
            <h3 style={{ marginTop: "20px" }}>📝 Observaciones</h3>

            <div className="pc-observaciones">
              {observaciones.length === 0 && (
                <p className="pc-empty">No hay observaciones aún.</p>
              )}

              {observaciones.map((o) => (
                <div key={o.id} className="pc-obs-item">
                  <p>{o.observacion}</p>
                  <span>
                    {o.usuario} –{" "}
                    {new Date(o.created_at).toLocaleString("es-CO")}
                  </span>
                </div>
              ))}
            </div>

            {/* Agregar observación */}
            <div className="pc-add-obs">
              <textarea
                rows="2"
                placeholder="+ Añadir observación…"
                value={nuevaObs}
                onChange={(e) => setNuevaObs(e.target.value)}
              />
              <button onClick={agregarObservacion}>➕ Agregar</button>
            </div>

            {/* HISTORIAL Y DETALLES */}
            <h3 style={{ marginTop: 35 }}>📚 Historial y Detalles</h3>
            <div className="pc-historial">
              {renderHistorial()}
            </div>

          </div>
          
        )}

        

      </div>

      <Footer />
    </>
  );
}
