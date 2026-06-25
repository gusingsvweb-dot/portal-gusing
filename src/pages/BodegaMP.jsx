import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, st, ss } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "../pages/Produccion.css";

export default function BodegaMP() {
    const [searchParams] = useSearchParams();
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

    // MATERIAL IMPRESO
    const [pedidosMI, setPedidosMI] = useState([]);
    const [obsMIResponse, setObsMIResponse] = useState("");
    const [loadingMI, setLoadingMI] = useState(false);

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem("usuarioActual"));
        setUsuarioActual(user);
        loadPedidos();
        loadHistorial();
        loadSolicitudesMI();
    }, []);

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
            usuario: usuarioActual?.usuario || "BodegaMP",
            observacion: `✔ MATERIAL IMPRESO ENTREGADO: ${obsText}`,
        });

        try {
            const { notifyRoles } = await import("../api/notifications");
            await notifyRoles(
                ["acondicionamiento"],
                "Material Impreso Entregado",
                `Bodega MP entregó el material impreso para el Pedido #${selected.id}`,
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

    // Cargar Observaciones
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
        // Solo pedidos con items pendientes (estado_id < 11)
        const { data, error } = await supabase
            .from(st("pedidos_produccion"))
            .select(ss(`
        *,
        productos ( articulo ),
        clientes ( nombre ),
        estados ( nombre ),
        pedidos_bodega_items!inner(id)
      `))
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
                .from(st("pedidos_bodega_items"))
                .select(ss("*"))
                .eq("pedido_id", p.id)
                .order("id", { ascending: true });

            if (errItems) throw errItems;

            if (items && items.length > 0) {
                const { data: catalogo } = await supabase.from(st("MateriasPrimas")).select(ss("REFERENCIA, ARTICULO, UNIDAD"));
                const itemsConNombre = items.map(it => {
                    const matched = catalogo?.find(c => Number(c.REFERENCIA) === Number(it.referencia_materia_prima));
                    return { ...it, materia_prima: matched || { ARTICULO: `Ref: ${it.referencia_materia_prima}`, UNIDAD: "—" } };
                });
                setItemsDetallados(itemsConNombre);
            }
        } catch (err) { console.error(err); } finally { setItemsLoading(false); }
    }

    async function toggleItemCompletado(item) {
        await supabase.from(st("pedidos_bodega_items")).update({ completado: !item.completado }).eq("id", item.id);
        setItemsDetallados(prev => prev.map(i => i.id === item.id ? { ...i, completado: !i.completado } : i));
    }

    async function saveItem(item) {
        await supabase.from(st("pedidos_bodega_items")).update({
            cantidad_entregada: item.cantidad_entregada,
            observacion: item.observacion
        }).eq("id", item.id);
    }

    async function ejecutarUpdateEntrega() {
        const ahora = new Date().toISOString();
        const { error } = await supabase.from(st("pedidos_produccion")).update({
            fecha_entrega_de_materias_primas_e_insumos: ahora,
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
                            <p style={{ fontSize: '11px', color: 'var(--text-sub)', marginTop: '4px' }}>
                                🕒 Pedido: {formatFechaFull(p.fecha_solicitud_materias_primas, true)}
                            </p>
                        </div>
                    ))}

                    {/* SECCIÓN MATERIAL IMPRESO */}
                    {pedidosMI.length > 0 && (
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
                            <p><strong>OP:</strong> {selected.op || "—"}</p>
                            <p><strong>Lote:</strong> {selected.lote || "—"}</p>
                            <p><strong>Fecha Recepción:</strong> {selected.fecha_recepcion_cliente || "—"}</p>
                            <p><strong>Hora Solicitud MP:</strong> {formatFechaFull(selected.fecha_solicitud_materias_primas)}</p>
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

                        {itemsDetallados.length > 0 && (
                            <button className="pc-btn" onClick={confirmarEntrega} style={{ marginTop: '20px', width: '100%' }}>✔️ Confirmar Entrega Insumos</button>
                        )}
                    </div>
                )}
            </div>

            <div className="pc-wrapper" style={{ marginTop: 40 }}>
                <h2>📜 Historial de Entregas MP</h2>
                <table className="gc-table">
                    <thead><tr><th>ID</th><th>Producto</th><th>Fecha</th></tr></thead>
                    <tbody>
                        {historial.map(h => (
                            <tr key={h.id}>
                                <td>#{h.id}</td>
                                <td>{h.productos?.articulo}</td>
                                <td>{h.fecha_entrega_de_materias_primas_e_insumos ? new Date(h.fecha_entrega_de_materias_primas_e_insumos).toLocaleString("es-CO", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "—"}</td>
                            </tr>
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
