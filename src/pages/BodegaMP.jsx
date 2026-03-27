import React, { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "../pages/Produccion.css";

export default function BodegaMP() {
    const [pedidos, setPedidos] = useState([]);
    const [selected, setSelected] = useState(null);
    const [historial, setHistorial] = useState([]);
    const [itemsDetallados, setItemsDetallados] = useState([]);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [showHiddenList, setShowHiddenList] = useState(false); // Default hidden
    const [usuarioActual, setUsuarioActual] = useState(null);

    // MODAL CONFIRMACIÓN
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: "", message: "", type: "info", onConfirm: null });

    // OBSERVACIONES
    const [obs, setObs] = useState([]);
    const [newObs, setNewObs] = useState("");

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem("usuarioActual"));
        setUsuarioActual(user);
        loadPedidos();
        loadHistorial();
    }, []);

    // Cargar Observaciones
    async function cargarObservaciones(pedidoId) {
        const { data, error } = await supabase
            .from("observaciones_pedido")
            .select("*")
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

        const { error } = await supabase.from("observaciones_pedido").insert([{
            pedido_id: selected.id,
            usuario: usuarioActual?.usuario || "BodegaMP",
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

    async function loadPedidos() {
        // Solo pedidos con items pendientes (estado_id < 11)
        const { data, error } = await supabase
            .from("pedidos_produccion")
            .select(`
        *,
        productos ( articulo ),
        clientes ( nombre ),
        estados ( nombre ),
        pedidos_bodega_items!inner(id)
      `)
            .lt("estado_id", 11)
            .eq("pedidos_bodega_items.completado", false)
            .order("id", { ascending: false });

        if (error) console.error("Error cargando pedidos MP:", error);

        // Unificar y limpiar duplicados (PostgREST inner join puede traer múltiples filas)
        const unique = [];
        const map = new Map();
        if (data) {
            data.forEach(p => {
                if (!map.has(p.id)) {
                    map.set(p.id, true);
                    unique.push(p);
                }
            });
        }
        setPedidos(unique);
    }

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

    async function seleccionarPedido(p) {
        setSelected(p);
        setItemsDetallados([]);
        setShowHiddenList(false); // Reset to hidden
        setItemsLoading(true);
        cargarObservaciones(p.id);
        try {
            const { data: items, error: errItems } = await supabase
                .from("pedidos_bodega_items")
                .select("*")
                .eq("pedido_id", p.id)
                .order("id", { ascending: true });

            if (errItems) throw errItems;

            if (items && items.length > 0) {
                const { data: catalogo } = await supabase.from("MateriasPrimas").select("REFERENCIA, ARTICULO, UNIDAD");
                const itemsConNombre = items.map(it => {
                    const matched = catalogo?.find(c => Number(c.REFERENCIA) === Number(it.referencia_materia_prima));
                    return { ...it, materia_prima: matched || { ARTICULO: `Ref: ${it.referencia_materia_prima}`, UNIDAD: "—" } };
                });
                setItemsDetallados(itemsConNombre);
            }
        } catch (err) { console.error(err); } finally { setItemsLoading(false); }
    }

    async function toggleItemCompletado(item) {
        await supabase.from("pedidos_bodega_items").update({ completado: !item.completado }).eq("id", item.id);
        setItemsDetallados(prev => prev.map(i => i.id === item.id ? { ...i, completado: !i.completado } : i));

        if (!item.completado) {
            try {
                const { notifyRoles } = await import("../api/notifications");
                await notifyRoles(["produccion"], "Insumos Bodega", `Bodega entrego insumos para el pedido #${selected.id}`, selected.id, "informacion");
            } catch (err) { console.error(err); }
        }
    }

    async function saveItem(item) {
        await supabase.from("pedidos_bodega_items").update({
            cantidad_entregada: item.cantidad_entregada,
            observacion: item.observacion
        }).eq("id", item.id);
    }

    async function ejecutarUpdateEntrega() {
        const hoy = new Date().toISOString().slice(0, 10);
        const { error } = await supabase.from("pedidos_produccion").update({
            fecha_entrega_de_materias_primas_e_insumos: hoy,
            estado_id: 5,
            asignado_a: "produccion",
        }).eq("id", selected.id);

        if (!error) {
            try {
                const { notifyRoles } = await import("../api/notifications");
                await notifyRoles(["produccion"], "Insumos Bodega", `Bodega entrego insumos para el pedido #${selected.id}`, selected.id, "accion_requerida");
            } catch (err) { console.error(err); }

            setSelected(null);
            loadPedidos();
            loadHistorial();
        } else {
            console.error(error);
            alert("Error al actualizar.");
        }
    }

    function cerrarModal() {
        setConfirmModal({ ...confirmModal, isOpen: false });
    }

    function confirmarEntrega() {
        if (!selected) return;
        const todoCompleto = itemsDetallados.every(i => i.completado);
        const criticosPendientes = itemsDetallados.some(i => i.es_critico && !i.completado);

        const proceedToFinalConfirm = () => {
            const msg = todoCompleto
                ? "El pedido pasará a Producción con todos los insumos entregados."
                : "El pedido pasará a Producción aunque falten insumos. ¿Deseas continuar?";

            setConfirmModal({
                isOpen: true,
                title: todoCompleto ? "✅ Confirmar Entrega Total" : "⚠️ Confirmar Entrega Parcial",
                message: msg,
                type: todoCompleto ? "info" : "warning",
                onConfirm: async () => {
                    await ejecutarUpdateEntrega();
                    cerrarModal();
                }
            });
        };

        if (criticosPendientes) {
            setConfirmModal({
                isOpen: true,
                title: "⛔ Insumos Críticos Pendientes",
                message: "Hay insumos CRÍTICOS sin marcar como completados (o con entrega parcial).\n\n¿Estás seguro de que deseas confirmar? Esto podría detener el proceso más adelante.",
                type: "danger",
                onConfirm: () => {
                    // Cierra el actual y abre el siguiente
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    setTimeout(proceedToFinalConfirm, 200);
                }
            });
            return;
        }

        proceedToFinalConfirm();
    }

    return (
        <>
            <Navbar />
            <div className="pc-wrapper">
                <div className="pc-list">
                    <h2>📦 Bodega MP (Insumos)</h2>
                    <h4 className="pc-section-title">Pendientes por Insumos</h4>
                    {pedidos.length === 0 && <p className="pc-empty">No hay pedidos pendientes.</p>}
                    {pedidos.map(p => (
                        <div key={p.id} className={`pc-item ${selected?.id === p.id ? "pc-item-selected" : ""}`} onClick={() => seleccionarPedido(p)}>
                            <span className="pc-item-op">Or. Producción: {p.op || p.id}</span>
                            <p><strong>Producto:</strong> {p.productos?.articulo}</p>
                            <p><strong>Cliente:</strong> {p.clientes?.nombre}</p>
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
                            title="Shift + Click para ver lista de insumos"
                        >
                            📄 Detalle del Pedido
                            <span style={{ fontSize: '12px', background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--text-sub)' }}>
                                #{selected.id}
                            </span>
                            {itemsDetallados.length > 0 && <span style={{ fontSize: '10px', verticalAlign: 'middle' }}>●</span>}
                        </h3>
                        {/* ... details grid ... */}
                        <div className="pc-detail-grid">
                            <p><strong>OP:</strong> {selected.op || "N/A"}</p>
                            <p><strong>Lote:</strong> {selected.lote || "N/A"}</p>
                            <p><strong>Producto:</strong> {selected.productos?.articulo}</p>
                            <p><strong>Cliente:</strong> {selected.clientes?.nombre}</p>
                            <p><strong>Cantidad:</strong> {selected.cantidad}</p>
                            <p><strong>Fecha Recepción:</strong> {selected.fecha_recepcion_cliente || "—"}</p>
                        </div>

                        {/* SECCIÓN DE OBSERVACIONES */}
                        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: 'var(--bg-app)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <h4 style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--text-main)' }}>📝 Observaciones</h4>
                            {/* ... obs content omitted for brevity ... */}
                            <div className="pc-observaciones" style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '10px' }}>
                                {obs.length === 0 && <p className="pc-empty" style={{ fontSize: '13px' }}>No hay observaciones.</p>}
                                {obs.map((o) => (
                                    <div key={o.id} className="pc-obs-item" style={{ fontSize: '13px', padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                        <p style={{ margin: 0 }}>{o.observacion}</p>
                                        <span style={{ fontSize: '11px', color: 'var(--text-sub)', display: 'block', marginTop: '4px' }}>
                                            {o.usuario} – {new Date(o.created_at).toLocaleString("es-CO")}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <textarea
                                    rows="2"
                                    placeholder="+ Añadir nota..."
                                    value={newObs}
                                    onChange={(e) => setNewObs(e.target.value)}
                                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', background: 'var(--bg-input)', color: 'var(--text-main)' }}
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

                        {showHiddenList && (
                            <div className="pc-items-table" style={{ marginTop: '20px', padding: '15px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                <h4 style={{ fontSize: '14px', marginBottom: '10px', color: 'var(--text-main)' }}>📋 Lista de Insumos</h4>
                                {itemsLoading ? <p>Cargando...</p> : (
                                    <table className="ac-bulk-table">
                                        <thead>
                                            <tr><th>Insumo</th><th>⚠️</th><th>Solicitada</th><th>Entregada</th><th>Entregado</th></tr>
                                        </thead>
                                        <tbody>
                                            {itemsDetallados.map(it => (
                                                <tr key={it.id} style={it.es_critico ? { background: '#fff1f2' } : {}}>
                                                    <td><strong>{it.materia_prima?.ARTICULO}</strong></td>
                                                    <td>{it.es_critico ? "🔴" : ""}</td>
                                                    <td>{it.cantidad}</td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            defaultValue={it.cantidad_entregada}
                                                            onBlur={(e) => { it.cantidad_entregada = e.target.value; saveItem(it); }}
                                                            style={{ width: '60px', padding: '4px', border: '1px solid #ddd', borderRadius: '4px' }}
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input type="checkbox" checked={!!it.completado} onChange={() => toggleItemCompletado(it)} style={{ transform: 'scale(1.2)' }} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}
                        <button className="pc-btn" onClick={confirmarEntrega} style={{ marginTop: '20px', width: '100%' }}>✔️ Confirmar Entrega</button>
                    </div>
                )}
            </div>

            <div className="pc-wrapper" style={{ marginTop: 40 }}>
                <h2>📜 Historial de Entregas MP</h2>
                <table className="gc-table">
                    <thead><tr><th>ID</th><th>Producto</th><th>Fecha</th></tr></thead>
                    <tbody>
                        {historial.map(h => (
                            <tr key={h.id}><td>#{h.id}</td><td>{h.productos?.articulo}</td><td>{h.fecha_entrega_de_materias_primas_e_insumos}</td></tr>
                        ))}
                    </tbody>
                </table>
            </div>


            {/* MODAL PERSONALIZADO */}
            {
                confirmModal.isOpen && (
                    <div className="modal-backdrop" style={{ zIndex: 10000 }}>
                        <div className="modal-card" style={{ maxWidth: 450, textAlign: 'center' }}>
                            <h3 style={{ justifyContent: 'center', color: confirmModal.type === 'danger' ? '#ef4444' : (confirmModal.type === 'warning' ? '#f59e0b' : '#334155') }}>
                                {confirmModal.title}
                            </h3>
                            <p style={{ margin: "20px 0", fontSize: "15px", lineHeight: "1.5", whiteSpace: "pre-line" }}>
                                {confirmModal.message}
                            </p>
                            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                                <button className="pc-btn" onClick={cerrarModal} style={{ background: "#94a3b8", width: 'auto', padding: '10px 20px', marginTop: 0 }}>
                                    Cancelar
                                </button>
                                <button
                                    className="pc-btn"
                                    onClick={confirmModal.onConfirm}
                                    style={{
                                        background: confirmModal.type === 'danger' ? '#dc2626' : (confirmModal.type === 'warning' ? '#d97706' : '#2563eb'),
                                        width: 'auto',
                                        padding: '10px 20px',
                                        marginTop: 0
                                    }}
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            <Footer />
        </>
    );
}
