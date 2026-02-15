import React, { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";

export default function Bodega() {
  const [pedidos, setPedidos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [itemsDetallados, setItemsDetallados] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [showHiddenList, setShowHiddenList] = useState(false);

  /* ===========================================================
     CARGAR PEDIDOS ASIGNADOS A BODEGA
  =========================================================== */
  /* ===========================================================
     CARGAR PEDIDOS ASIGNADOS A BODEGA (Y PENDIENTES)
  =========================================================== */
  async function loadPedidos() {
    // 1. Pedidos asignados explicitamente a bodega
    const { data: dataBodega, error: errBodega } = await supabase
      .from("pedidos_produccion")
      .select(`
        *,
        productos ( articulo ),
        clientes ( nombre ),
        estados ( nombre )
      `)
      .eq("asignado_a", "bodega")
      .order("id", { ascending: false });

    if (errBodega) console.error("Error cargando bodega:", errBodega);

    // 2. Pedidos en Produccion con items pendientes (Parciales)
    // Filtramos aquellos que tengan items NO completados
    const { data: dataPendientes, error: errPend } = await supabase
      .from("pedidos_produccion")
      .select(`
        *,
        productos ( articulo ),
        clientes ( nombre ),
        estados ( nombre ),
        pedidos_bodega_items!inner(id)
      `)
      .neq("asignado_a", "bodega") // Evitar duplicados con la primera query
      .eq("pedidos_bodega_items.completado", false)
      .order("id", { ascending: false });

    if (errPend) console.error("Error cargando pendientes:", errPend);

    // Unificar listas
    let total = [];
    if (dataBodega) total = [...total, ...dataBodega];
    if (dataPendientes) {
      // Eliminar posibles duplicados si la query inner trae multiples filas por items
      const map = new Map();
      total.forEach(p => map.set(p.id, p));
      dataPendientes.forEach(p => map.set(p.id, p));
      total = Array.from(map.values());
    }

    // Ordenar por ID descendente
    total.sort((a, b) => b.id - a.id);

    setPedidos(total);
  }

  /* ===========================================================
     SOLICITAR AUTORIZACIÓN (ESTADO 11 -> 13)
  =========================================================== */
  async function solicitarAutorizacion() {
    if (!selected) return;

    const { error } = await supabase
      .from("pedidos_produccion")
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

    if (!window.confirm(`¿Confirmar DESPACHO FÍSICO del pedido #${selected.id}?\nEsta acción registrará la fecha de entrega y finalizará el pedido.`)) return;

    const hoy = new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from("pedidos_produccion")
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
      .from("pedidos_produccion")
      .select(`
        id,
        fecha_entrega_de_materias_primas_e_insumos,
        productos ( articulo ),
        clientes ( nombre )
      `)
      .not("fecha_entrega_de_materias_primas_e_insumos", "is", null)
      .order("fecha_entrega_de_materias_primas_e_insumos", { ascending: false });

    if (!error) setHistorial(data || []);
  }

  useEffect(() => {
    loadPedidos();
    loadHistorial();
  }, []);

  /* ===========================================================
     SELECCIONAR PEDIDO
  =========================================================== */
  async function seleccionarPedido(p) {
    setSelected(p);
    setItemsDetallados([]);
    setShowHiddenList(false); // Resetear visibilidad al cambiar de pedido

    setItemsLoading(true);
    try {
      // 1. Cargar items del pedido
      const { data: items, error: errItems } = await supabase
        .from("pedidos_bodega_items")
        .select("*")
        .eq("pedido_id", p.id)
        .order("id", { ascending: true });

      if (errItems) throw errItems;

      if (items && items.length > 0) {
        // 2. Cargar catálogo de materias primas para cruzar nombres
        const { data: catalogo, error: errCat } = await supabase
          .from("MateriasPrimas")
          .select("REFERENCIA, ARTICULO, UNIDAD");

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
      .from("pedidos_bodega_items")
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
      .from("pedidos_bodega_items")
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

    // Validar carga de items
    if (itemsDetallados.length === 0) {
      alert("Error: No hay items cargados o la lista está vacía. Intente recargar el pedido.");
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

    const hoy = new Date().toISOString().slice(0, 10);
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
      const { error } = await supabase
        .from("pedidos_produccion")
        .update({
          fecha_entrega_de_materias_primas_e_insumos: hoy,
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
        const msgTitulo = "Materias Primas/insumos ENVIADAS";
        const msgCuerpo = `Bodega ha enviado insumos para el Pedido #${selected.id}`;

        await notifyRoles(["produccion"], msgTitulo, msgCuerpo, selected.id, "accion_requerida");
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
          "Actualización de Insumos",
          `Bodega ha actualizado insumos para el Pedido #${selected.id}.`,
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

          <h4 style={{ margin: '15px 0 10px', color: '#64748b', fontSize: '13px', textTransform: 'uppercase' }}>Pendientes por Insumos</h4>
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
            </div>
          ))}

          <h4 style={{ margin: '25px 0 10px', color: '#64748b', fontSize: '13px', textTransform: 'uppercase' }}>Despachos PT</h4>
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
            </div>
          ))}
        </div>

        {selected && (
          <div className="pc-detail fadeIn">
            <h3
              onClick={(e) => {
                if (e.shiftKey) setShowHiddenList(!showHiddenList);
              }}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              title="Shift + Click para ver información oculta"
            >
              📄 Detalle del Pedido
              {itemsDetallados.length > 0 && <span style={{ fontSize: '10px', verticalAlign: 'middle' }}>●</span>}
            </h3>

            <div className="pc-detail-grid">
              <p><strong>Producto:</strong> {selected.productos?.articulo}</p>
              <p><strong>Cliente:</strong> {selected.clientes?.nombre}</p>
              <p><strong>Cantidad:</strong> {selected.cantidad}</p>
              <p><strong>Estado:</strong> {selected.estados?.nombre}</p>
            </div>

            {selected.estado_id < 11 ? (
              <>
                <h3 style={{ marginTop: 20 }}>📦 Registrar entrega MP</h3>
                <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', fontStyle: 'italic' }}>
                  (Shift + Click en "Detalle del Pedido" para ver/editar la lista de insumos)
                </p>

                {itemsDetallados.length > 0 && showHiddenList && (
                  <div style={{ marginBottom: '20px', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ marginBottom: '10px', fontSize: '14px', color: '#1e293b' }}>Lista de insumos solicitados:</h4>
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
                                    {esBajo && (
                                      <div style={{ color: '#e11d48', fontSize: '10px', fontWeight: 'bold', marginTop: '4px' }}>
                                        ⚠️ Cantidad menor a la solicitada
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>{it.es_critico ? "🔴" : ""}</td>
                                  <td>{it.cantidad}</td>
                                  <td>
                                    <input
                                      type="number"
                                      value={it.cantidad_entregada || ""}
                                      onChange={(e) => updateItemField(it.id, 'cantidad_entregada', e.target.value)}
                                      onBlur={() => saveItem(it)}
                                      style={{ width: '60px', padding: '4px', border: esBajo ? '1px solid #e11d48' : '1px solid #cbd5e1' }}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      value={it.observacion || ""}
                                      onChange={(e) => updateItemField(it.id, 'observacion', e.target.value)}
                                      onBlur={() => saveItem(it)}
                                      placeholder="..."
                                      style={{ width: '100%', padding: '4px' }}
                                    />
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <input
                                      type="checkbox"
                                      checked={!!it.completado}
                                      onChange={() => toggleItemCompletado(it)}
                                      style={{ transform: 'scale(1.2)' }}
                                    />
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

                <label>Fecha solicitud de MP</label>
                <input
                  type="date"
                  value={selected.fecha_solicitud_materias_primas || ""}
                  disabled
                />

                <p style={{ marginTop: 10, fontStyle: "italic", color: "#444" }}>
                  Al confirmar, se registrará la fecha actual como fecha de entrega.
                </p>

                <button
                  className="pc-btn"
                  onClick={confirmarEntrega}
                  disabled={itemsDetallados.length > 0 && itemsDetallados.some(i => i.es_critico && (!i.completado || (i.cantidad_entregada && Number(i.cantidad_entregada) < Number(i.cantidad))))}
                  style={itemsDetallados.length > 0 && itemsDetallados.some(i => i.es_critico && (!i.completado || (i.cantidad_entregada && Number(i.cantidad_entregada) < Number(i.cantidad)))) ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                >
                  ✔️ Confirmar entrega y avanzar etapa
                </button>
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 20 }}>🚀 Despacho de Producto Terminado</h3>
                <div style={{ background: '#ecfdf5', padding: '20px', borderRadius: '12px', border: '1px solid #10b981', marginTop: '10px' }}>
                  <p style={{ color: '#065f46', fontSize: '15px', lineHeight: '1.5' }}>
                    Este pedido ha sido liberado por <strong>Control de Calidad</strong> y está listo para ser entregado al cliente.
                  </p>

                  {selected.estado_id === 11 ? (
                    <div style={{ marginTop: '20px' }}>
                      <p style={{ fontWeight: '600', color: '#047857', marginBottom: '10px' }}>
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
                      <p style={{ fontWeight: '600', color: '#047857', marginBottom: '10px' }}>
                        ✅ ¡DESPACHO AUTORIZADO!
                      </p>
                      <p style={{ fontSize: '14px', color: '#065f46', marginBottom: '15px' }}>
                        Atención al Cliente ha aprobado la entrega. Proceda al despacho físico.
                      </p>
                      <button
                        className="pc-btn"
                        style={{ background: '#059669', width: '100%' }}
                        onClick={despacharProducto}
                      >
                        🚚 Registrar Despacho Físico
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: '20px', padding: '10px', background: '#d1fae5', borderRadius: '8px' }}>
                      <p style={{ color: '#065f46', fontWeight: 'bold' }}>
                        ⏳ Esperando autorización de Atención al Cliente...
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

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
                  <td>{new Date(h.fecha_entrega_de_materias_primas_e_insumos).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Footer />
    </>
  );
}
