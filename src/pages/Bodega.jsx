import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, st, ss } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import "../pages/Produccion.css";

export default function Bodega() {
  const [searchParams] = useSearchParams();
  const { usuarioActual } = useAuth();
  const rol = usuarioActual?.rol || "bodega";

  const [pedidos, setPedidos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [itemsDetallados, setItemsDetallados] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // MATERIAL IMPRESO
  const [pedidosMI, setPedidosMI] = useState([]);
  const [obsMIResponse, setObsMIResponse] = useState("");
  const [loadingMI, setLoadingMI] = useState(false);

  // OBSERVACIONES
  const [obs, setObs] = useState([]);
  const [newObs, setNewObs] = useState("");

  /* ===========================================================
     CARGAR PEDIDOS ASIGNADOS A BODEGA
  =========================================================== */
  /* ===========================================================
     CARGAR PEDIDOS ASIGNADOS A BODEGA (Y PENDIENTES)
  =========================================================== */
  function formatFechaFull(f, soloHora = false) {
    if (!f) return "—";
    const isDateOnly = f.length === 10;
    const d = isDateOnly ? new Date(f + "T00:00:00") : new Date(f);
    if (soloHora) {
      if (isDateOnly) return "—";
      return d.toLocaleTimeString("es-CO", { hour: '2-digit', minute: '2-digit' });
    }
    if (isDateOnly) {
      return d.toLocaleDateString("es-CO", { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return d.toLocaleString("es-CO", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }


  async function loadPedidos() {
    // 1. Pedidos asignados explicitamente a bodega
    const { data: dataBodega, error: errBodega } = await supabase
      .from(st("pedidos_produccion"))
      .select(ss("*, productos ( articulo ), clientes ( nombre ), estados ( nombre )"))
      .eq("asignado_a", "bodega")
      .order("id", { ascending: false });

    if (errBodega) console.error("Error cargando bodega:", errBodega);

    // 2. Pedidos en Produccion con items pendientes (Parciales)
    // Filtramos aquellos que tengan items NO completados
    const { data: dataPendientes, error: errPend } = await supabase
      .from(st("pedidos_produccion"))
      .select(ss(`
        *,
        productos ( articulo ),
        clientes ( nombre ),
        estados ( nombre ),
        pedidos_bodega_items!inner(id)
      `))
      .neq("asignado_a", "bodega") // Evitar duplicados con la primera query
      .eq("pedidos_bodega_items.completado", false)
      .order("id", { ascending: false });

    if (errPend) console.error("Error cargando pendientes:", errPend);

    // Unificar listas
    let total = [];
    if (dataBodega) total = [...total, ...dataBodega];
    if (dataPendientes) {
      const map = new Map();
      total.forEach(p => map.set(p.id, p));
      dataPendientes.forEach(p => map.set(p.id, p));
      total = Array.from(map.values());
    }

    // --- FILTRADO POR ROL ---
    if (rol === "bodega_mp") {
      total = total.filter(p => p.estado_id < 11);
    } else if (rol === "bodega_pt") {
      total = total.filter(p => [11, 13].includes(p.estado_id));
    } else {
      // Para rol 'bodega' general, excluimos los ya finalizados (12)
      total = total.filter(p => p.estado_id !== 12);
    }

    // Ordenar por ID descendente
    total.sort((a, b) => b.id - a.id);

    setPedidos(total);
  }

  async function loadSolicitudesMI() {
    const { data, error } = await supabase
      .from(st("pedidos_produccion"))
      .select(ss("*, productos(articulo), clientes(nombre), estados(nombre)"))
      .not("solicitud_material_impreso", "is", null)
      .neq("solicitud_material_impreso_atendida", true)
      .order("id", { ascending: false });
    if (!error) setPedidosMI(data || []);
  }

  async function confirmarMaterialImpreso() {
    if (!selected) return;
    setLoadingMI(true);

    const { error } = await supabase
      .from(st("pedidos_produccion"))
      .update({ solicitud_material_impreso_atendida: true })
      .eq("id", selected.id);

    if (error) { alert("Error al confirmar entrega"); setLoadingMI(false); return; }

    const obsText = obsMIResponse.trim() || "Material impreso entregado.";
    await supabase.from(st("observaciones_pedido")).insert({
      pedido_id: selected.id,
      usuario: usuarioActual?.usuario || "Bodega",
      observacion: `✔ MATERIAL IMPRESO ENTREGADO: ${obsText}`,
    });

    try {
      const { notifyRoles } = await import("../api/notifications");
      await notifyRoles(
        ["acondicionamiento"],
        "Material Impreso Entregado",
        `Bodega entregó el material impreso para el Pedido #${selected.id}`,
        selected.id,
        "accion_requerida"
      );
    } catch (e) { console.error(e); }

    setObsMIResponse("");
    setSelected(null);
    setLoadingMI(false);
    loadSolicitudesMI();
    loadPedidos();
  }

  /* ===========================================================
     SOLICITAR AUTORIZACIÓN (ESTADO 11 -> 13)
  =========================================================== */
  async function solicitarAutorizacion() {
    if (!selected) return;

    const { error } = await supabase
      .from(st("pedidos_produccion"))
      .update({
        estado_id: 13, // Pendiente Autorización Atencion Cliente
        asignado_a: "atencion"
      })
      .eq("id", selected.id);

    if (error) {
      alert("Error al solicitar autorización.");
      return;
    }

    // Notificar a Atención al Cliente
    try {
      const { notifyRoles } = await import("../api/notifications");
      await notifyRoles(
        ["atencion", "comercial"],
        "Autorización de Despacho Requerida",
        `Bodega solicita autorización para despachar el Pedido #${selected.id}.`,
        selected.id,
        "accion_requerida"
      );
    } catch (e) { console.error(e); }

    alert("Solicitud enviada a Atención al Cliente.");
    setSelected(null);
    loadPedidos();
  }

  /* ===========================================================
     DESPACHAR PRODUCTO (ESTADO 13 -> 12)
  =========================================================== */
  async function despacharProducto() {
    if (!selected) return;

    // Bloqueo duro por Cuarentena (Debe estar ANTES del update)
    if (!selected.fecha_liberacion_cuarentena) {
        alert("⚠️ No se puede registrar el despacho: El pedido aún no cuenta con la liberación física de Cuarentena por parte de Control de Calidad.");
        return;
    }

    if (!window.confirm(`¿Confirmar DESPACHO FÍSICO del pedido #${selected.id}?\nEsta acción registrará la fecha de entrega y finalizará el pedido.`)) return;

    const hoy = new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from(st("pedidos_produccion"))
      .update({
        estado_id: 12, // Finalizado
        asignado_a: "completado",
        fecha_entrega_cliente: hoy
      })
      .eq("id", selected.id);

    if (error) {
      alert("Error al registrar despacho.");
      return;
    }

    // Notificar a Atención al Cliente
    try {
      const { notifyRoles } = await import("../api/notifications");
      await notifyRoles(
        ["atencion", "comercial"],
        "Pedido Despachado",
        `Bodega ha despachado físicamente el Pedido #${selected.id}. El proceso ha finalizado.`,
        selected.id,
        "informacion"
      );
    } catch (e) { console.error(e); }

    alert("✔ Pedido despachado y finalizado correctamente.");
    setSelected(null);
    loadPedidos();
    loadHistorial();
  }

  /* ===========================================================
     CARGAR HISTORIAL DE ENTREGAS MP
  =========================================================== */
  async function loadHistorial() {
    const { data, error } = await supabase
      .from(st("pedidos_produccion"))
      .select(ss(`
        id,
        fecha_entrega_de_materias_primas_e_insumos,
        productos ( articulo ),
        clientes ( nombre )
      `))
      .not("fecha_entrega_de_materias_primas_e_insumos", "is", null)
      .order("fecha_entrega_de_materias_primas_e_insumos", { ascending: false });

    if (!error) setHistorial(data || []);
  }

  // ==========================
  // CARGAR OBSERVACIONES
  // ==========================
  async function cargarObservaciones(pedidoId) {
    const { data, error } = await supabase
      .from(st("observaciones_pedido"))
      .select(ss("*"))
      .eq("pedido_id", pedidoId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Error cargarObservaciones:", error);
      return;
    }
    setObs(data || []);
  }

  async function addObs() {
    if (!newObs.trim() || !selected) return;

    const { error } = await supabase.from(st("observaciones_pedido")).insert([{
      pedido_id: selected.id,
      usuario: usuarioActual?.usuario || "Bodega",
      observacion: newObs,
    }]);

    if (error) {
      console.error("❌ Error addObs:", error);
      alert("Error al guardar observación.");
      return;
    }

    setNewObs("");
    cargarObservaciones(selected.id);
  }

  useEffect(() => {
    loadPedidos();
    loadHistorial();
    loadSolicitudesMI();
  }, []);

  // Seleccionar automáticamente si viene un ?id= en la URL
  useEffect(() => {
    if (pedidos.length === 0) return;
    const idParam = searchParams.get("id");
    if (!idParam) return;
    const targetId = Number(idParam);
    const p = pedidos.find(it => it.id === targetId);
    if (p) {
      seleccionarPedido(p);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [pedidos, searchParams]);

  /* ===========================================================
     SELECCIONAR PEDIDO
  =========================================================== */
  async function seleccionarPedido(p) {
    setSelected(p);
    setItemsDetallados([]);

    // Cargar Observaciones
    cargarObservaciones(p.id);

    setItemsLoading(true);
    try {
      // 1. Cargar items del pedido
      const { data: items, error: errItems } = await supabase
        .from(st("pedidos_bodega_items"))
        .select(ss("*"))
        .eq("pedido_id", p.id)
        .order("id", { ascending: true });

      if (errItems) throw errItems;

      if (items && items.length > 0) {
        // 2. Cargar catálogo de materias primas para cruzar nombres
        const { data: catalogo, error: errCat } = await supabase
          .from(st("MateriasPrimas"))
          .select(ss("REFERENCIA, ARTICULO, UNIDAD"));

        if (errCat) throw errCat;

        // 3. Cruzar datos en memoria
        const itemsConNombre = items.map(it => {
          const matched = catalogo.find(c => Number(c.REFERENCIA) === Number(it.referencia_materia_prima));
          return {
            ...it,
            materia_prima: matched || { ARTICULO: `Ref: ${it.referencia_materia_prima}`, UNIDAD: "—" }
          };
        });

        setItemsDetallados(itemsConNombre);
      }
    } catch (err) {
      console.error("Error cargando items detailed:", err);
    } finally {
      setItemsLoading(false);
    }
  }

  /* ===========================================================
     MARCAR ITEM COMO COMPLETADO
  =========================================================== */
  async function toggleItemCompletado(item) {
    const { error } = await supabase
      .from(st("pedidos_bodega_items"))
      .update({ completado: !item.completado, updated_at: new Date().toISOString() })
      .eq("id", item.id);

    if (error) {
      console.error("Error actualizando item:", error);
      alert("Error al actualizar el estado del insumo.");
      return;
    }

    // Refrescar lista local
    setItemsDetallados(prev => prev.map(i => i.id === item.id ? { ...i, completado: !i.completado } : i));
  }

  /* ===========================================================
     ACTUALIZAR CAMPO DE ITEM (CANTIDAD / OBSERVACION)
  =========================================================== */
  async function updateItemField(itemId, field, value) {
    // 1. Actualizar estado local
    setItemsDetallados(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));

    // 2. Guardar en BD (debounce manual o onBlur idealmente, aquí directo para simplicidad)
    // Para evitar spam, mejor lo hacemos onBlur en el input, pero si queremos reactividad inmediata...
    // Vamos a hacer una función separada para "save" y llamarla onBlur.
  }

  async function saveItem(item) {
    const { error } = await supabase
      .from(st("pedidos_bodega_items"))
      .update({
        cantidad_entregada: item.cantidad_entregada,
        observacion: item.observacion,
        updated_at: new Date().toISOString()
      })
      .eq("id", item.id);

    if (error) {
      console.error("Error guardando item:", error);
      // alert("Error al guardar cambios del item"); // Opcional, para no ser invasivo
    }
  }

  /* ===========================================================
     CONFIRMAR ENTREGA (fecha automática)
  =========================================================== */
  async function confirmarEntrega() {
    if (!selected) return;

    // PARCIAL: sin items, solo confirmar entrega
    if (selected.tipo_solicitud_mp === 'parcial') {
      const ok = window.confirm("¿Confirmar entrega y avanzar el pedido a Producción?");
      if (!ok) return;
      const ahora = new Date().toISOString();
      const { error } = await supabase
        .from(st("pedidos_produccion"))
        .update({ fecha_entrega_de_materias_primas_e_insumos: ahora, estado_id: 5, asignado_a: "produccion" })
        .eq("id", selected.id);
      if (error) return alert("Error guardando entrega");
      try {
        const { notifyRoles } = await import("../api/notifications");
        await notifyRoles(["produccion"], "MP Entregada (Parcial)", `Bodega confirmó entrega parcial para pedido #${selected.id}`, selected.id, "accion_requerida");
      } catch (e) { console.error(e); }
      alert("Entrega registrada. Pedido enviado a Producción.");
      setSelected(null);
      loadPedidos();
      loadHistorial();
      return;
    }

    // Si no hay ítems solicitados, tratar como entrega completa sin validar lista
    if (itemsDetallados.length === 0) {
      const ok = window.confirm("No hay ítems registrados para este pedido. ¿Confirmar entrega y avanzar a Producción?");
      if (!ok) return;
      const ahora = new Date().toISOString();
      const { error } = await supabase
        .from(st("pedidos_produccion"))
        .update({ fecha_entrega_de_materias_primas_e_insumos: ahora, estado_id: 5, asignado_a: "produccion" })
        .eq("id", selected.id);
      if (error) return alert("Error guardando entrega");
      try {
        const { notifyRoles } = await import("../api/notifications");
        await notifyRoles(["produccion"], "MP Entregada", `Bodega confirmó entrega para pedido #${selected.id}`, selected.id, "accion_requerida");
      } catch (e) { console.error(e); }
      alert("Entrega registrada. Pedido enviado a Producción.");
      setSelected(null);
      loadPedidos();
      loadHistorial();
      return;
    }

    // Calcular estados
    const todoCompleto = itemsDetallados.every(i => i.completado);
    const criticosPendientes = itemsDetallados.some(i => i.es_critico && !i.completado);
    const noCriticosPendientes = itemsDetallados.some(i => !i.es_critico && !i.completado);

    // 1. Bloqueo duro: Críticos pendientes
    if (criticosPendientes) {
      alert("No se puede confirmar: Faltan insumos CRÍTICOS.");
      return;
    }

    let avanzarAProduccion = false;

    // 2. Determinar si se avanza
    if (todoCompleto) {
      // Confirmar total
      const confirmTotal = window.confirm(
        "¿Confirmar ENTREGA TOTAL?\n\n" +
        "Todos los insumos están listos. El pedido pasará a Producción y saldrá de su lista."
      );
      if (!confirmTotal) return;
      avanzarAProduccion = true;
    } else if (noCriticosPendientes) {
      // Confirmar parcial (Críticos OK)
      // User requested generic message
      const deseaAvanzar = window.confirm(
        "¿Confirmar entrega y avance de etapa?\n\n" +
        "(Si cancela, el pedido se mantendrá en Bodega)"
      );
      avanzarAProduccion = deseaAvanzar;
    } else {
      // Fallback (ej: confirmación sin items o caso borde)
      avanzarAProduccion = true;
    }

    // 3. Ejecutar acción
    if (avanzarAProduccion) {
      // AVANZAR A PRODUCCION (Estado 5)
      const ahora = new Date().toISOString();
      const { error } = await supabase
        .from(st("pedidos_produccion"))
        .update({
          fecha_entrega_de_materias_primas_e_insumos: ahora,
          estado_id: 5,
          asignado_a: "produccion",
        })
        .eq("id", selected.id);

      if (error) {
        console.error("Error guardando:", error);
        return alert("Error guardando entrega");
      }

      // Notificar (Generico)
      try {
        const { notifyRoles } = await import("../api/notifications");
        await notifyRoles(
          ["produccion"], 
          "Insumos Bodega", 
          `Bodega entrego insumos para el pedido #${selected.id}`, 
          selected.id, 
          "accion_requerida"
        );
      } catch (err) { console.error(err); }

      alert("Entrega registrada. Pedido enviado a Producción.");
      setSelected(null);
      loadPedidos();
      loadHistorial();

    } else {
      // QUEDARSE EN BODEGA (Entrega Parcial)
      if (!noCriticosPendientes) return; // Si canceló y no hay pendientes (raro), salir.

      // Notificar (Discreto/Generico)
      try {
        const { notifyRoles } = await import("../api/notifications");
        await notifyRoles(
          ["produccion"],
          "Insumos Bodega",
          `Bodega entrego insumos para el pedido #${selected.id}`,
          selected.id,
          "informacion"
        );
      } catch (err) { console.error(err); }

      alert("Avance registrado. El pedido PERMANECE en Bodega.");
      loadPedidos();
    }
  }

  /* ===========================================================
     RENDER PRINCIPAL
  =========================================================== */
  return (
    <>
      <Navbar />

      <div className="pc-wrapper">
        <div className="pc-list">
          <h2>📦 Bodega</h2>

          {rol !== "bodega_pt" && (
            <>
              <h4 className="pc-section-title">Pendientes por Insumos</h4>
              {pedidos.filter(p => p.estado_id < 11).length === 0 && (
                <p className="pc-empty" style={{ fontSize: '13px' }}>No hay pedidos por insumos.</p>
              )}
              {pedidos.filter(p => p.estado_id < 11).map((p) => (
                <div
                  key={p.id}
                  className={`pc-item ${selected?.id === p.id ? "pc-item-selected" : ""}`}
                  onClick={() => seleccionarPedido(p)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
                      Or. Producción: {p.op || p.id}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      {p.productos?.articulo}
                    </span>
                  </div>
                  <p style={{ marginTop: 8 }}><strong>Cliente:</strong> {p.clientes?.nombre}</p>
                  <p><strong>Estado:</strong> {p.estados?.nombre}</p>
                  <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    🕒 Pedido: {formatFechaFull(p.fecha_solicitud_materias_primas, true)}
                  </p>
                </div>
              ))}
            </>
          )}

          {rol !== "bodega_pt" && pedidosMI.length > 0 && (
            <>
              <div style={{
                margin: "18px 0 10px",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <div style={{ flex: 1, height: 1, background: "var(--border-color)" }} />
                <span style={{
                  fontSize: "0.7rem", fontWeight: 800, color: "#7c3aed",
                  background: "#ede9fe", padding: "3px 10px", borderRadius: 99,
                  border: "1px solid #c4b5fd", whiteSpace: "nowrap",
                }}>
                  📦 Material Impreso · {pedidosMI.length}
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--border-color)" }} />
              </div>
              {pedidosMI.map(p => (
                <div
                  key={`mi-${p.id}`}
                  className={`pc-item ${selected?.id === p.id ? "pc-item-selected" : ""}`}
                  onClick={() => seleccionarPedido(p)}
                  style={{ borderLeft: "4px solid #7c3aed" }}
                >
                  <span className="pc-id-tag" style={{ background: "#7c3aed" }}>#{p.id}</span>
                  <p><strong>Producto:</strong> {p.productos?.articulo}</p>
                  <p><strong>Cliente:</strong> {p.clientes?.nombre}</p>
                  <p style={{
                    fontSize: "0.75rem", marginTop: 6, color: "#6d28d9",
                    background: "#ede9fe", borderRadius: 6, padding: "4px 8px",
                    fontStyle: "italic",
                  }}>
                    "{p.solicitud_material_impreso?.slice(0, 60)}{p.solicitud_material_impreso?.length > 60 ? "…" : ""}"
                  </p>
                </div>
              ))}
            </>
          )}

          {rol !== "bodega_mp" && (
            <>
              <h4 className="pc-section-title">Despachos PT</h4>
              {pedidos.filter(p => p.estado_id >= 11).length === 0 && (
                <p className="pc-empty" style={{ fontSize: '13px' }}>No hay despachos pendientes.</p>
              )}
              {pedidos.filter(p => p.estado_id >= 11).map((p) => (
                <div
                  key={p.id}
                  className={`pc-item ${selected?.id === p.id ? "pc-item-selected" : ""}`}
                  onClick={() => seleccionarPedido(p)}
                  style={{ borderLeft: '4px solid #10b981' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
                      Or. Producción: {p.op || p.id}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      {p.productos?.articulo}
                    </span>
                  </div>
                  <p style={{ marginTop: 8 }}><strong>Cliente:</strong> {p.clientes?.nombre}</p>
                  <p><strong>Estado:</strong> <span style={{ color: '#059669', fontWeight: 'bold' }}>{p.estados?.nombre}</span></p>
                  <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    🕒 Solicitado: {p.fecha_solicitud_materias_primas ? new Date(p.fecha_solicitud_materias_primas).toLocaleTimeString("es-CO", { hour: '2-digit', minute: '2-digit' }) : "—"}
                  </p>
                </div>
              ))}
            </>
          )}
        </div>

        {selected && (
          <div className="pc-detail fadeIn">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              📄 Detalle del Pedido
              <span style={{ fontSize: '12px', background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--text-sub)' }}>
                #{selected.id}
              </span>
              {selected.tipo_solicitud_mp && (
                <span style={{
                  fontSize: '11px', fontWeight: 800, padding: '2px 10px', borderRadius: 99,
                  ...(selected.tipo_solicitud_mp === 'parcial'
                    ? { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }
                    : { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd' })
                }}>
                  {selected.tipo_solicitud_mp === 'parcial' ? '📦 PARCIAL' : '📋 COMPLETA'}
                </span>
              )}
            </h3>

            <div className="pc-detail-grid">
              <p><strong>OP:</strong> {selected.op || "N/A"}</p>
              <p><strong>Lote:</strong> {selected.lote || "N/A"}</p>
              <p><strong>Producto:</strong> {selected.productos?.articulo}</p>
              <p><strong>Cliente:</strong> {selected.clientes?.nombre}</p>
              <p><strong>Cantidad:</strong> {selected.cantidad}</p>
              <p><strong>OP:</strong> {selected.op || "—"}</p>
              <p><strong>Lote:</strong> {selected.lote || "—"}</p>
              <p><strong>Fecha Recepción:</strong> {selected.fecha_recepcion_cliente || "—"}</p>
              <p><strong>Hora Solicitud MP:</strong> {formatFechaFull(selected.fecha_solicitud_materias_primas)}</p>
              {selected.fecha_entrega_de_materias_primas_e_insumos && (
                <p><strong>Hora Entrega MP:</strong> {formatFechaFull(selected.fecha_entrega_de_materias_primas_e_insumos)}</p>
              )}
              <p><strong>Estado:</strong> {selected.estados?.nombre}</p>
              <p><strong>Liberación Cuarentena:</strong> {selected.fecha_liberacion_cuarentena 
                  ? <span style={{color: '#10b981', fontWeight: 'bold'}}>✔ Liberada</span> 
                  : <span style={{color: '#ef4444', fontWeight: 'bold'}}>⏳ Pendiente</span>}
              </p>
            </div>

            {selected.estado_id >= 11 && !selected.fecha_liberacion_cuarentena && (
                <div style={{
                    marginTop: '15px',
                    padding: '12px',
                    background: '#fef2f2',
                    border: '1px solid #fee2e2',
                    borderRadius: '10px',
                    color: '#991b1b',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}>
                    <span style={{fontSize: '18px'}}>🛡️</span>
                    <p style={{margin: 0}}><strong>Validación de Calidad Requerida:</strong> Este pedido no puede ser despachado hasta que se firme su liberación de Cuarentena.</p>
                </div>
            )}

            {/* SECCIÓN DE OBSERVACIONES */}
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: 'var(--bg-app)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--text-main)' }}>📝 Observaciones</h4>
              <div className="pc-observaciones" style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '10px' }}>
                {obs.length === 0 && <p className="pc-empty" style={{ fontSize: '13px' }}>No hay observaciones.</p>}
                {obs.map((o) => (
                  <div key={o.id} className="pc-obs-item" style={{ fontSize: '13px', padding: '8px', borderBottom: '1px solid #f1f5f9' }}>
                    <p style={{ margin: 0 }}>{o.observacion}</p>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                      {o.usuario} – {new Date(o.created_at).toLocaleString("es-CO")}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: '10px' }}>
                <button 
                  className="pc-btn" 
                  onClick={() => setNewObs("Materia prima entregada")}
                  style={{ background: 'var(--bg-app)', color: 'var(--text-sub)', fontSize: '11px', padding: '4px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', width: 'auto', marginTop: 0 }}
                >
                  💡 Sugerir: "Materia prima entregada"
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <textarea
                  rows="2"
                  placeholder="+ Añadir nota..."
                  value={newObs}
                  onChange={(e) => setNewObs(e.target.value)}
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
                <button
                  className="pc-btn"
                  onClick={addObs}
                  style={{ width: 'auto', padding: '0 15px', fontSize: '13px' }}
                >
                  ➕
                </button>
              </div>
            </div>

            {selected.estado_id < 11 ? (
              <>
                <h3 style={{ marginTop: 20 }}>📦 Registrar entrega MP</h3>

                {selected.tipo_solicitud_mp === 'parcial' ? (
                  /* ── PARCIAL: sin discriminar insumos ── */
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: 16, marginTop: 10 }}>
                    <p style={{ color: '#0369a1', fontSize: 13, marginBottom: 14 }}>
                      Solicitud <strong>PARCIAL</strong> — No hay insumos discriminados. Confirma la entrega para avanzar el pedido a Producción.
                    </p>
                    <button className="pc-btn" style={{ background: '#0369a1', width: '100%' }} onClick={confirmarEntrega}>
                      ✔️ Confirmar entrega y avanzar a Producción
                    </button>
                  </div>
                ) : (
                  /* ── COMPLETA / LEGACY: con tabla de insumos ── */
                  <>
                    {itemsDetallados.length > 0 && (
                      <div style={{ marginBottom: '20px', backgroundColor: 'var(--bg-app)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: 10 }}>
                        <h4 style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--text-main)' }}>📋 Lista de Insumos</h4>
                        {itemsLoading ? (
                          <p>Cargando insumos...</p>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table className="ac-bulk-table" style={{ fontSize: '12px' }}>
                              <thead>
                                <tr>
                                  <th>Insumo</th>
                                  <th title="Crítico">⚠️</th>
                                  <th>Cant. Solicitada</th>
                                  <th>Cant. Entregada</th>
                                  <th>Observación</th>
                                  <th style={{ textAlign: 'center' }}>Entregado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {itemsDetallados.map(it => {
                                  const esBajo = it.es_critico && it.cantidad_entregada && Number(it.cantidad_entregada) < Number(it.cantidad);
                                  return (
                                    <tr key={it.id} style={it.es_critico ? { background: '#fff1f2' } : {}}>
                                      <td>
                                        <strong>{it.materia_prima?.ARTICULO}</strong>
                                        <div style={{ fontSize: '10px', color: '#64748b' }}>{it.materia_prima?.UNIDAD}</div>
                                        {esBajo && <div style={{ color: '#e11d48', fontSize: '10px', fontWeight: 'bold', marginTop: '4px' }}>⚠️ Cantidad menor a la solicitada</div>}
                                      </td>
                                      <td style={{ textAlign: 'center' }}>{it.es_critico ? "🔴" : ""}</td>
                                      <td>{it.cantidad}</td>
                                      <td>
                                        <input type="number" value={it.cantidad_entregada || ""} onChange={(e) => updateItemField(it.id, 'cantidad_entregada', e.target.value)} onBlur={() => saveItem(it)} style={{ width: '60px', padding: '4px', border: esBajo ? '1px solid #e11d48' : '1px solid #cbd5e1', borderRadius: '4px' }} />
                                      </td>
                                      <td>
                                        <input type="text" value={it.observacion || ""} onChange={(e) => updateItemField(it.id, 'observacion', e.target.value)} onBlur={() => saveItem(it)} placeholder="..." style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        <input type="checkbox" checked={!!it.completado} onChange={() => toggleItemCompletado(it)} style={{ transform: 'scale(1.2)' }} />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                    <p style={{ marginTop: 10, fontStyle: "italic", color: "#444", fontSize: 13 }}>
                      Al confirmar, se registrará la fecha actual como fecha de entrega.
                    </p>
                    {(() => {
                      const bloqueado = itemsDetallados.length > 0 && itemsDetallados.some(i => i.es_critico && (!i.completado || (i.cantidad_entregada && Number(i.cantidad_entregada) < Number(i.cantidad))));
                      return (
                        <button className="pc-btn" onClick={confirmarEntrega} disabled={bloqueado} style={{ marginTop: '16px', width: '100%', ...(bloqueado ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}>
                          ✔️ Confirmar entrega y avanzar etapa
                        </button>
                      );
                    })()}
                  </>
                )}
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 20 }}>🚀 Despacho de Producto Terminado</h3>
                <div style={{ backgroundColor: 'rgba(52, 211, 153, 0.1)', padding: '20px', borderRadius: '12px', border: '1px solid #10b981', marginTop: '10px' }}>
                  <p style={{ color: selected.fecha_liberacion_cuarentena ? '#10b981' : '#f59e0b', fontSize: '15px', lineHeight: '1.5', fontWeight: '600' }}>
                    {selected.fecha_liberacion_cuarentena 
                      ? "Este pedido ha sido liberado por Control de Calidad y está listo para ser entregado al cliente."
                      : "Este pedido ha sido liberado administrativamente (PT), pero aún requiere liberación física de CUARENTENA."}
                  </p>

                  {selected.estado_id === 11 ? (
                    <div style={{ marginTop: '20px' }}>
                      <p style={{ fontWeight: '600', color: 'var(--text-main)', marginBottom: '10px' }}>
                        Paso siguiente: Solicitar autorización de despacho a Atención al Cliente.
                      </p>
                      <button
                        className="pc-btn"
                        style={{ background: '#10b981', width: '100%' }}
                        onClick={solicitarAutorizacion}
                      >
                        📩 Solicitar Autorización de Despacho
                      </button>
                    </div>
                  ) : selected.asignado_a === 'bodega' ? (
                    <div style={{ marginTop: '20px' }}>
                      <p style={{ fontWeight: '600', color: '#10b981', marginBottom: '10px' }}>
                        ✅ ¡DESPACHO AUTORIZADO!
                      </p>
                      <p style={{ fontSize: '14px', color: 'var(--text-main)', marginBottom: '15px' }}>
                        Atención al Cliente ha aprobado la entrega. Proceda al despacho físico.
                      </p>
                      <button
                        className="pc-btn"
                        style={{ 
                          background: selected.fecha_liberacion_cuarentena ? '#059669' : '#94a3b8', 
                          width: '100%',
                          cursor: selected.fecha_liberacion_cuarentena ? 'pointer' : 'not-allowed'
                        }}
                        onClick={despacharProducto}
                        disabled={!selected.fecha_liberacion_cuarentena}
                      >
                        🚚 Registrar Despacho Físico
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: '20px', padding: '10px', backgroundColor: 'rgba(52, 211, 153, 0.2)', borderRadius: '8px' }}>
                      <p style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>
                        ⏳ Esperando autorización de Atención al Cliente...
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* PANEL MATERIAL IMPRESO */}
            {selected.solicitud_material_impreso && !selected.solicitud_material_impreso_atendida && (
              <div style={{
                marginTop: 20, borderRadius: 14,
                border: "1.5px solid #a78bfa",
                background: "#faf5ff", overflow: "hidden",
              }}>
                <div style={{
                  padding: "12px 18px",
                  background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ fontSize: "1.1rem" }}>📦</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 800, color: "white", fontSize: "0.9rem" }}>
                      Solicitud de Material Impreso
                    </p>
                    <p style={{ margin: 0, fontSize: "0.72rem", color: "rgba(255,255,255,0.75)" }}>
                      Solicitado por Acondicionamiento
                    </p>
                  </div>
                  <span style={{
                    marginLeft: "auto", fontSize: "0.68rem", fontWeight: 800,
                    background: "#f59e0b", color: "white",
                    padding: "2px 10px", borderRadius: 99,
                  }}>
                    ⏳ Pendiente
                  </span>
                </div>
                <div style={{ padding: "14px 18px" }}>
                  <p style={{
                    fontSize: "0.88rem", color: "#1e293b",
                    background: "#ede9fe", border: "1px solid #c4b5fd",
                    borderRadius: 8, padding: "10px 12px",
                    lineHeight: 1.6, marginBottom: 14,
                  }}>
                    {selected.solicitud_material_impreso}
                  </p>
                  <p style={{ fontSize: "0.78rem", color: "#6d28d9", fontWeight: 700, marginBottom: 6 }}>
                    Nota de entrega (opcional):
                  </p>
                  <textarea
                    rows={2}
                    placeholder="Ej: Entregados 1000 etiquetas y 500 cajas…"
                    value={obsMIResponse}
                    onChange={e => setObsMIResponse(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: 8,
                      border: "1.5px solid #c4b5fd", fontSize: "0.85rem",
                      background: "white", color: "#1e293b",
                      resize: "vertical", fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    onClick={confirmarMaterialImpreso}
                    disabled={loadingMI}
                    style={{
                      marginTop: 10, width: "100%", padding: 11,
                      background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
                      color: "white", border: "none", borderRadius: 10,
                      fontWeight: 700, fontSize: "0.875rem",
                      cursor: loadingMI ? "default" : "pointer",
                      opacity: loadingMI ? 0.7 : 1,
                    }}
                  >
                    {loadingMI ? "Procesando…" : "✔ Confirmar entrega de material impreso"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {rol !== "bodega_pt" && (
        <div className="pc-wrapper" style={{ marginTop: 40 }}>
          <h2>📜 Historial de Entregas de Materias Primas</h2>
          {historial.length === 0 && (
            <p className="pc-empty">Aún no hay entregas registradas.</p>
          )}
          {historial.length > 0 && (
            <table className="gc-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Producto</th>
                  <th>Cliente</th>
                  <th>Fecha de entrega MP</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id}>
                    <td>#{h.id}</td>
                    <td>{h.productos?.articulo}</td>
                    <td>{h.clientes?.nombre}</td>
                    <td>{formatFechaFull(h.fecha_entrega_de_materias_primas_e_insumos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Footer />
    </>
  );
}
