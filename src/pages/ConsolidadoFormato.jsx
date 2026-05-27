import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { supabase, st, ss } from "../api/supabaseClient";
import Navbar from "../components/navbar.jsx";
import Footer from "../components/Footer";
import "./ConsolidadoFormato.css";

const BLUE_HEADER = { backgroundColor: "#1e3a5f", color: "#fff", fontWeight: 700, fontSize: 11, padding: "8px 10px", whiteSpace: "nowrap", border: "1px solid #b0c4de" };
const WHITE_HEADER = { backgroundColor: "#c7d9f0", color: "#1e3a5f", fontWeight: 700, fontSize: 11, padding: "8px 10px", whiteSpace: "nowrap", border: "1px solid #b0c4de" };

export default function ConsolidadoFormato() {
    const navigate = useNavigate();
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    // manual[id] = { cantidad_entregada, observacion }
    const [manual, setManual] = useState({});

    useEffect(() => {
        fetchPedidos();
    }, []);

    async function fetchPedidos() {
        setLoading(true);
        const { data } = await supabase
            .from(st("pedidos_produccion"))
            .select(ss(`
                *,
                clientes(nombre),
                productos(articulo, forma_farmaceutica),
                estados(nombre)
            `))
            .order("id", { ascending: false });
        setPedidos(data || []);
        setLoading(false);
    }

    function setManualField(pedidoId, field, value) {
        setManual(prev => ({
            ...prev,
            [pedidoId]: { ...(prev[pedidoId] || {}), [field]: value }
        }));
    }

    function downloadExcel() {
        const headers = [
            "FECHA DE INGRESO DEL PEDIDO",
            "NUMERO DE LA ORDEN DE PEDIDO",
            "CLIENTE",
            "ORDEN DE PRODUCCIÓN",
            "NOMBRE DEL PRODUCTO",
            "FORMA FARMACÉUTICA",
            "CANTIDAD SOLICITADA EN EL PEDIDO",
            "ETAPA ACTUAL DE PRODUCCIÓN",
            "FECHA DE ENTREGA A ACONDICIONAMIENTO",
            "FECHA DE COMPROMISO DE ENTREGA A BODEGA DE PT",
            "FECHA REAL DE ENTREGA A BODEGA DE PT",
            "CANTIDAD ENTREGADA",
            "OBSERVACIÓN",
        ];

        const rows = pedidos.map(p => {
            const m = manual[p.id] || {};
            return [
                p.fecha_recepcion_cliente || "",
                p.id,
                p.clientes?.nombre || "",
                p.op || "",
                p.productos?.articulo || "",
                p.productos?.forma_farmaceutica || "",
                p.cantidad || "",
                p.estados?.nombre || "",
                p.fecha_inicio_acondicionamiento || "",
                p.fecha_maxima_entrega || "",
                p.fecha_entrega_bodega || "",
                m.cantidad_entregada || "",
                m.observacion || "",
            ];
        });

        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Estilos de ancho de columna
        ws["!cols"] = headers.map(() => ({ wch: 28 }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Consolidado Formato");
        XLSX.writeFile(wb, `consolidado_formato_${new Date().toISOString().split("T")[0]}.xlsx`);
    }

    return (
        <>
            <Navbar />
            <div className="cf-wrapper">
                <div className="cf-header">
                    <div className="cf-header-left">
                        <button className="cf-back-btn" onClick={() => navigate("/consolidado")}>
                            ← Volver al Consolidado
                        </button>
                        <div>
                            <h1 className="cf-title">📋 Consolidado para Formato</h1>
                            <p className="cf-subtitle">
                                Campos <span className="cf-legend-blue">azules</span> se toman de la base de datos.
                                Campos <span className="cf-legend-white">celestes</span> se llenan manualmente.
                            </p>
                        </div>
                    </div>
                    <button className="cf-download-btn" onClick={downloadExcel}>
                        📥 Descargar Excel
                    </button>
                </div>

                <div className="cf-table-container">
                    {loading ? (
                        <div className="cf-loading">Cargando pedidos...</div>
                    ) : (
                        <table className="cf-table">
                            <thead>
                                <tr>
                                    <th style={BLUE_HEADER}>FECHA DE INGRESO DEL PEDIDO</th>
                                    <th style={BLUE_HEADER}>N° ORDEN DE PEDIDO</th>
                                    <th style={BLUE_HEADER}>CLIENTE</th>
                                    <th style={BLUE_HEADER}>ORDEN DE PRODUCCIÓN</th>
                                    <th style={BLUE_HEADER}>NOMBRE DEL PRODUCTO</th>
                                    <th style={BLUE_HEADER}>FORMA FARMACÉUTICA</th>
                                    <th style={BLUE_HEADER}>CANTIDAD SOLICITADA</th>
                                    <th style={BLUE_HEADER}>ETAPA ACTUAL DE PRODUCCIÓN</th>
                                    <th style={BLUE_HEADER}>F. ENTREGA A ACONDICIONAMIENTO</th>
                                    <th style={BLUE_HEADER}>F. COMPROMISO ENTREGA BODEGA PT</th>
                                    <th style={BLUE_HEADER}>F. REAL ENTREGA BODEGA PT</th>
                                    <th style={WHITE_HEADER}>CANTIDAD ENTREGADA</th>
                                    <th style={WHITE_HEADER}>OBSERVACIÓN</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pedidos.map(p => {
                                    const m = manual[p.id] || {};
                                    return (
                                        <tr key={p.id} className="cf-row">
                                            <td className="cf-cell-blue">{p.fecha_recepcion_cliente || "—"}</td>
                                            <td className="cf-cell-blue">#{p.id}</td>
                                            <td className="cf-cell-blue">{p.clientes?.nombre || "—"}</td>
                                            <td className="cf-cell-blue">{p.op || "—"}</td>
                                            <td className="cf-cell-blue cf-cell-producto">{p.productos?.articulo || "—"}</td>
                                            <td className="cf-cell-blue">{p.productos?.forma_farmaceutica || "—"}</td>
                                            <td className="cf-cell-blue" style={{ textAlign: "center" }}>{p.cantidad || "—"}</td>
                                            <td className="cf-cell-blue">{p.estados?.nombre || "—"}</td>
                                            <td className="cf-cell-blue">{p.fecha_inicio_acondicionamiento || "—"}</td>
                                            <td className="cf-cell-blue">{p.fecha_maxima_entrega || "—"}</td>
                                            <td className="cf-cell-blue">{p.fecha_entrega_bodega || "—"}</td>
                                            <td className="cf-cell-white">
                                                <input
                                                    className="cf-input"
                                                    type="text"
                                                    placeholder="—"
                                                    value={m.cantidad_entregada || ""}
                                                    onChange={e => setManualField(p.id, "cantidad_entregada", e.target.value)}
                                                />
                                            </td>
                                            <td className="cf-cell-white">
                                                <input
                                                    className="cf-input cf-input-wide"
                                                    type="text"
                                                    placeholder="—"
                                                    value={m.observacion || ""}
                                                    onChange={e => setManualField(p.id, "observacion", e.target.value)}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
            <Footer />
        </>
    );
}
