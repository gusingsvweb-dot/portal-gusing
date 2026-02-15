import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar.jsx";
import Footer from "../components/Footer";
import { notifyRoles } from "../api/notifications";
import "./AtencionCliente.css";

export default function AutorizarDespachos() {
    const [pendientes, setPendientes] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        cargarPendientesAutorizar();
    }, []);

    async function cargarPendientesAutorizar() {
        setLoading(true);
        const { data } = await supabase
            .from("pedidos_produccion")
            .select(`
        *,
        productos ( articulo ),
        clientes ( nombre )
      `)
            .eq("estado_id", 13)
            .eq("asignado_a", "atencion")
            .order("id", { ascending: false });
        setPendientes(data || []);
        setLoading(false);
    }

    async function autorizarDespacho(pedidoId) {
        if (!window.confirm(`¿Está seguro de autorizar la entrega del pedido #${pedidoId}?`)) return;

        setLoading(true);
        const fechaHoy = new Date().toISOString().slice(0, 10);

        const { error } = await supabase
            .from("pedidos_produccion")
            .update({
                estado_id: 13, // Mantiene estado 13 (Pendiente)
                asignado_a: "bodega", // Devuelve a bodega
                // Se elimina la fecha_entrega_cliente de aquí
            })
            .eq("id", pedidoId);

        if (error) {
            alert("Error al autorizar despacho.");
        } else {
            // Notificar a Bodega de vuelta
            try {
                await notifyRoles(
                    ["bodega"],
                    "Despacho Autorizado",
                    `Atención al Cliente ha autorizado el despacho del Pedido #${pedidoId}.`,
                    pedidoId,
                    "informacion"
                );
            } catch (e) { console.error(e); }

            alert("✔ Despacho autorizado. El pedido ha sido enviado a Bodega para el despacho físico.");
            cargarPendientesAutorizar();
        }
        setLoading(false);
    }

    return (
        <>
            <Navbar />
            <div className="ac-wrapper">
                <div className="ac-card fadeIn wide" style={{ border: "2px solid #10b981", background: "#f0fdf4" }}>
                    <h2 className="ac-title">🚀 Autorización de Despacho (PT)</h2>
                    <p className="ac-subtitle">Pedidos liberados por Calidad que requieren confirmación final para entrega al cliente.</p>

                    {loading && pendientes.length === 0 ? (
                        <p style={{ textAlign: "center", padding: "20px" }}>Cargando pendientes...</p>
                    ) : pendientes.length === 0 ? (
                        <div style={{ marginTop: "20px", color: "#059669", fontWeight: "600", textAlign: "center", padding: "40px", background: "#d1fae5", borderRadius: "12px" }}>
                            <span style={{ fontSize: "40px", display: "block", marginBottom: "15px" }}>✅</span>
                            No hay despachos pendientes por autorizar en este momento.
                        </div>
                    ) : (
                        <div className="ac-bulk-container">
                            <table className="ac-bulk-table">
                                <thead>
                                    <tr>
                                        <th>Pedido</th>
                                        <th>Producto</th>
                                        <th>Cliente</th>
                                        <th>Cantidad</th>
                                        <th>Fecha Registro</th>
                                        <th>Prioridad</th>
                                        <th>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendientes.map(p => (
                                        <tr key={p.id}>
                                            <td><strong>#{p.id}</strong></td>
                                            <td>{p.productos?.articulo}</td>
                                            <td>{p.clientes?.nombre}</td>
                                            <td>{p.cantidad}</td>
                                            <td>{p.fecha_recepcion_cliente}</td>
                                            <td>
                                                <span className={`pc-chip prioridad-${p.prioridad?.toLowerCase().replace(" ", "-")}`}>
                                                    {p.prioridad}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    className="ac-btn"
                                                    style={{ padding: "8px 15px", background: "#10b981", fontSize: "13px" }}
                                                    onClick={() => autorizarDespacho(p.id)}
                                                    disabled={loading}
                                                >
                                                    ✅ Autorizar Entrega
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
            <Footer />
        </>
    );
}
