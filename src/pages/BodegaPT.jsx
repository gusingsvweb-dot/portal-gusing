import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, st } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "../pages/Produccion.css";

export default function BodegaPT() {
    const [searchParams] = useSearchParams();
    const [pedidos, setPedidos] = useState([]);
    const [selected, setSelected] = useState(null);
    const [usuarioActual, setUsuarioActual] = useState(null);

    // OBSERVACIONES
    const [obs, setObs] = useState([]);
    const [newObs, setNewObs] = useState("");

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem("usuarioActual"));
        setUsuarioActual(user);
        loadPedidos();
    }, []);

    function formatFechaFull(f, soloHora = false) {
        if (!f) return "—";
        const d = (f.length === 10) ? new Date(f + "T00:00:00") : new Date(f);
        if (soloHora) {
            if (f.length === 10) return "—";
            return d.toLocaleTimeString("es-CO", { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleString("es-CO");
    }

    // Cargar Observaciones
    async function cargarObservaciones(pedidoId) {
        const { data, error } = await supabase
            .from(st("observaciones_pedido"))
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

        const { error } = await supabase.from(st("observaciones_pedido")).insert([{
            pedido_id: selected.id,
            usuario: usuarioActual?.usuario || "BodegaPT",
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
        // Pedidos liberados (estado_id >= 11)
        const { data, error } = await supabase
            .from(st("pedidos_produccion"))
            .select(`
        *,
        productos ( articulo ),
        clientes ( nombre ),
        estados ( nombre )
      `)
            .in("estado_id", [11, 13])
            .order("id", { ascending: false });

        if (error) console.error("Error cargando pedidos PT:", error);
        setPedidos(data || []);
    }

    // Seleccionar automáticamente si viene un ?id= en la URL
    useEffect(() => {
        if (pedidos.length === 0) return;
        const idParam = searchParams.get("id");
        if (!idParam) return;
        const targetId = Number(idParam);
        const p = pedidos.find(it => it.id === targetId);
        if (p) {
            setSelected(p);
            cargarObservaciones(p.id);
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [pedidos, searchParams]);

    useEffect(() => {
        loadPedidos();
    }, []);

    async function solicitarAutorizacion() {
        if (!selected) return;
        const { error } = await supabase.from(st("pedidos_produccion")).update({ estado_id: 13, asignado_a: "atencion" }).eq("id", selected.id);
        if (!error) {
            const { notifyRoles } = await import("../api/notifications");
            await notifyRoles(["atencion"], "Autorización Requerida", `Bodega solicita autorización para despacho #${selected.id}`, selected.id, "accion_requerida");
            alert("Solicitud enviada.");
            setSelected(null);
            loadPedidos();
        }
    }

    async function despacharProducto() {
        if (!selected) return;
        
        // Bloqueo por Cuarentena
        if (!selected.fecha_liberacion_cuarentena) {
            alert("⚠️ No se puede despachar: El pedido aún no ha sido liberado de Cuarentena por Control de Calidad.");
            return;
        }

        if (!window.confirm("¿Confirmar DESPACHO FÍSICO?")) return;
        const hoy = new Date().toISOString().slice(0, 10);
        const { error } = await supabase.from(st("pedidos_produccion")).update({ estado_id: 12, asignado_a: "completado", fecha_entrega_cliente: hoy }).eq("id", selected.id);
        if (!error) {
            const { notifyRoles } = await import("../api/notifications");
            await notifyRoles(["atencion"], "Pedido Despachado", `Pedido #${selected.id} despachado.`, selected.id, "informacion");
            alert("Pedido despachado.");
            setSelected(null);
            loadPedidos();
        }
    }

    return (
        <>

            <Navbar />
            <div className="pc-wrapper">
                <div className="pc-list">
                    <h2>📦 Bodega PT (Despachos)</h2>
                    <h4 className="pc-section-title">Despachos PT</h4>
                    {pedidos.length === 0 && <p className="pc-empty">No hay despachos pendientes.</p>}
                    {pedidos.map(p => (
                        <div key={p.id} className={`pc-item ${selected?.id === p.id ? "pc-item-selected" : ""}`} onClick={() => { setSelected(p); cargarObservaciones(p.id); }} style={{ borderLeft: '4px solid #10b981' }}>
                            <span className="pc-item-op">Or. Producción: {p.op || p.id}</span>
                            <p><strong>Producto:</strong> {p.productos?.articulo}</p>
                            <p><strong>Estado:</strong> {p.estados?.nombre}</p>
                        </div>
                    ))}
                </div>

                {selected && (
                    <div className="pc-detail fadeIn">
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            🚀 Gestión de Despacho
                            <span style={{ fontSize: '12px', background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--text-sub)' }}>
                                #{selected.id}
                            </span>
                        </h3>
                        <div className="pc-detail-grid">
                            <p><strong>OP:</strong> {selected.op || "N/A"}</p>
                            <p><strong>Lote:</strong> {selected.lote || "N/A"}</p>
                            <p><strong>Producto:</strong> {selected.productos?.articulo}</p>
                            <p><strong>Cliente:</strong> {selected.clientes?.nombre}</p>
                            <p><strong>Estado:</strong> {selected.estados?.nombre}</p>
                            <p><strong>Fecha Recepción:</strong> {selected.fecha_recepcion_cliente || "—"}</p>
                            <p><strong>Hora Solicitud MP:</strong> {formatFechaFull(selected.fecha_solicitud_materias_primas)}</p>
                            <p><strong>Hora Entrega MP:</strong> {formatFechaFull(selected.fecha_entrega_de_materias_primas_e_insumos)}</p>
                            <p><strong>Liberación Cuarentena:</strong> {selected.fecha_liberacion_cuarentena 
                                ? <span style={{color: '#10b981'}}>✔ Liberada</span> 
                                : <span style={{color: '#ef4444'}}>⏳ Pendiente</span>}
                            </p>
                        </div>



                        {/* SECCIÓN DE OBSERVACIONES */}
                        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: 'var(--bg-app)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <h4 style={{ marginBottom: '10px', fontSize: '14px', color: 'var(--text-main)' }}>📝 Observaciones</h4>
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

                        <div style={{ backgroundColor: 'rgba(52, 211, 153, 0.1)', padding: '20px', borderRadius: '12px', border: '1px solid #10b981', marginTop: '20px' }}>
                            <p style={{ color: selected.fecha_liberacion_cuarentena ? '#10b981' : '#f59e0b', fontSize: '15px', lineHeight: '1.5', fontWeight: '600', marginBottom: '10px' }}>
                                {selected.fecha_liberacion_cuarentena 
                                    ? "Este pedido ha sido liberado por Control de Calidad y está listo para ser entregado al cliente."
                                    : "Este pedido ha sido liberado administrativamente (PT), pero aún requiere liberación física de CUARENTENA."}
                            </p>

                            {selected.estado_id === 11 ? (
                                <div style={{ marginTop: '10px' }}>
                                    <p style={{ fontWeight: '600', color: 'var(--text-main)', marginBottom: '10px', fontSize: '14px' }}>
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
                                <div style={{ marginTop: '10px' }}>
                                    <p style={{ fontWeight: '600', color: '#10b981', marginBottom: '10px', fontSize: '14px' }}>
                                        ✅ ¡DESPACHO AUTORIZADO!
                                    </p>
                                    <p style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '15px' }}>
                                        Atención al Cliente ha aprobado la entrega. Proceda al despacho físico.
                                    </p>
                                    <button
                                        className="pc-btn"
                                        onClick={despacharProducto}
                                        style={{ 
                                          background: selected.fecha_liberacion_cuarentena ? '#059669' : '#94a3b8', 
                                          width: '100%',
                                          cursor: selected.fecha_liberacion_cuarentena ? 'pointer' : 'not-allowed'
                                        }}
                                    >
                                        🚚 Registrar Despacho Físico
                                    </button>
                                </div>
                            ) : (
                                <div style={{ marginTop: '10px', textAlign: 'center' }}>
                                    <p style={{ color: '#6366f1', fontWeight: '600' }}>⏳ Esperando autorización de Atención al Cliente...</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div >
            <Footer />
        </>
    );
}
