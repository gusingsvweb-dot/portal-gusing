import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { supabase, st, ss } from "../api/supabaseClient";
import Navbar from "../components/navbar.jsx";
import Footer from "../components/Footer";
import "./ConsolidadoFormato.css";

const BH = { backgroundColor: "#1e3a5f", color: "#fff", fontWeight: 700, fontSize: 11, padding: "8px 10px", whiteSpace: "nowrap", border: "1px solid #b0c4de" };
const MH = { backgroundColor: "#c7d9f0", color: "#1e3a5f", fontWeight: 700, fontSize: 11, padding: "8px 10px", whiteSpace: "nowrap", border: "1px solid #b0c4de" };

export default function ConsolidadoFormato() {
    const navigate = useNavigate();
    const [pedidos, setPedidos] = useState([]);
    const [etapaDict, setEtapaDict] = useState({}); // { pedidoId: { nombre, fecha_inicio } }
    const [loading, setLoading] = useState(true);
    // manual[pedidoId] = { num_orden, op, forma_farmaceutica, observacion }
    const [manual, setManual] = useState({});

    useEffect(() => { fetchAll(); }, []);

    async function fetchAll() {
        setLoading(true);

        const [{ data: peds }, { data: etapas }] = await Promise.all([
            supabase
                .from(st("pedidos_produccion"))
                .select(ss("*, clientes(nombre), productos(articulo, forma_farmaceutica), estados(nombre)"))
                .order("id", { ascending: false }),
            supabase
                .from(st("pedido_etapas"))
                .select(ss("pedido_id, nombre, orden, estado, fecha_inicio"))
                .neq("estado", "completada")
        ]);

        // Build etapaDict: first pending stage per pedido
        const dict = {};
        (etapas || []).forEach(e => {
            const pid = e.pedido_id;
            if (!dict[pid] || (e.orden || 0) < (dict[pid].orden || 0)) {
                dict[pid] = e;
            }
        });
        setEtapaDict(dict);
        setPedidos(peds || []);
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
            "FECHA DE ETAPA",
            "FECHA DE ENTREGA A ACONDICIONAMIENTO",
            "FECHA DE COMPROMISO DE ENTREGA A BODEGA DE PRODUCTO TERMINADO",
            "FECHA REAL DE ENTREGA A BODEGA DE PRODUCTO TERMINADO",
            "CANTIDAD ENTREGADA",
            "OBSERVACIÓN",
        ];

        const rows = pedidos.map(p => {
            const m = manual[p.id] || {};
            const etapa = etapaDict[p.id];
            return [
                p.fecha_recepcion_cliente || "",
                m.num_orden || "",
                p.clientes?.nombre || "",
                m.op || "",
                p.productos?.articulo || "",
                m.forma_farmaceutica || "",
                p.cantidad || "",
                p.estados?.nombre || "",
                etapa?.fecha_inicio || "",
                p.fecha_inicio_acondicionamiento || "",
                p.fecha_maxima_entrega || "",
                p.fecha_entrega_bodega || "",
                p.cantidad_entregada || "",
                m.observacion || "",
            ];
        });

        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws["!cols"] = headers.map((h, i) => ({ wch: i >= 9 && i <= 11 ? 40 : 26 }));

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
                                Campos <span className="cf-legend-blue">azul oscuro</span> vienen de la base de datos.&nbsp;
                                Campos <span className="cf-legend-white">celeste</span> se llenan manualmente.
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
                                    <th style={BH}>FECHA DE INGRESO DEL PEDIDO</th>
                                    <th style={MH}>NUMERO DE LA ORDEN DE PEDIDO</th>
                                    <th style={BH}>CLIENTE</th>
                                    <th style={MH}>ORDEN DE PRODUCCIÓN</th>
                                    <th style={BH}>NOMBRE DEL PRODUCTO</th>
                                    <th style={MH}>FORMA FARMACÉUTICA</th>
                                    <th style={BH}>CANTIDAD SOLICITADA EN EL PEDIDO</th>
                                    <th style={BH}>ETAPA ACTUAL DE PRODUCCIÓN</th>
                                    <th style={BH}>FECHA DE ETAPA</th>
                                    <th style={BH}>FECHA DE ENTREGA A ACONDICIONAMIENTO</th>
                                    <th style={BH}>FECHA DE COMPROMISO DE ENTREGA A BODEGA DE PT</th>
                                    <th style={BH}>FECHA REAL DE ENTREGA A BODEGA DE PT</th>
                                    <th style={BH}>CANTIDAD ENTREGADA</th>
                                    <th style={MH}>OBSERVACIÓN</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pedidos.map(p => {
                                    const m = manual[p.id] || {};
                                    const etapa = etapaDict[p.id];
                                    return (
                                        <tr key={p.id} className="cf-row">
                                            <td className="cf-cell-blue">{p.fecha_recepcion_cliente || "—"}</td>
                                            <td className="cf-cell-manual">
                                                <input className="cf-input" placeholder="—" value={m.num_orden || ""}
                                                    onChange={e => setManualField(p.id, "num_orden", e.target.value)} />
                                            </td>
                                            <td className="cf-cell-blue">{p.clientes?.nombre || "—"}</td>
                                            <td className="cf-cell-manual">
                                                <input className="cf-input" placeholder="—" value={m.op || ""}
                                                    onChange={e => setManualField(p.id, "op", e.target.value)} />
                                            </td>
                                            <td className="cf-cell-blue cf-cell-producto">{p.productos?.articulo || "—"}</td>
                                            <td className="cf-cell-manual">
                                                <input className="cf-input cf-input-med" placeholder="—" value={m.forma_farmaceutica || ""}
                                                    onChange={e => setManualField(p.id, "forma_farmaceutica", e.target.value)} />
                                            </td>
                                            <td className="cf-cell-blue" style={{ textAlign: "center" }}>{p.cantidad || "—"}</td>
                                            <td className="cf-cell-blue">{p.estados?.nombre || "—"}</td>
                                            <td className="cf-cell-blue">{etapa?.fecha_inicio || "—"}</td>
                                            <td className="cf-cell-blue">{p.fecha_inicio_acondicionamiento || "—"}</td>
                                            <td className="cf-cell-blue">{p.fecha_maxima_entrega || "—"}</td>
                                            <td className="cf-cell-blue">{p.fecha_entrega_bodega || "—"}</td>
                                            <td className="cf-cell-blue">{p.cantidad_entregada || "—"}</td>
                                            <td className="cf-cell-manual">
                                                <input className="cf-input cf-input-wide" placeholder="—" value={m.observacion || ""}
                                                    onChange={e => setManualField(p.id, "observacion", e.target.value)} />
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
