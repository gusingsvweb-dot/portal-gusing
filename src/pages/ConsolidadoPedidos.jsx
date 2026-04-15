import React, { useState, useEffect, useMemo } from "react";
import { supabase, st, ss } from "../api/supabaseClient";
import Navbar from "../components/navbar.jsx";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import "./ConsolidadoPedidos.css";

export default function ConsolidadoPedidos() {
    const { usuarioActual } = useAuth();
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);

    // Estado para los filtros de cada columna
    const [filtros, setFiltros] = useState({
        id: "",
        cliente: "",
        producto: "",
        estado: "",
        prioridad: "",
        cantidad: "",
        fecha: ""
    });

    // Paginación
    const [pagina, setPagina] = useState(1);
    const registrosPorPagina = 100;

    const diffDias = (f1, f2) => {
        if (!f1 || !f2) return null;
        const d1 = new Date(f1);
        const d2 = new Date(f2);
        const diffTime = d2 - d1;
        return diffTime / (1000 * 60 * 60 * 24);
    };

    useEffect(() => {
        fetchPedidos();
    }, []);

    async function fetchPedidos() {
        setLoading(true);
        // Hacemos JOIN con clientes, productos y estados para mostrar nombres reales
        const { data, error } = await supabase
            .from(st("pedidos_produccion"))
            .select(ss(`
        *,
        clientes(nombre),
        productos(articulo),
        estados(nombre)
      `))
            .order("id", { ascending: false });

        if (error) {
            console.error("Error fetching consolidated orders:", error);
        } else {
            setPedidos(data || []);
            syncMetricas(data || []);
        }
        setLoading(false);
    }

    async function syncMetricas(lista) {
        const updates = [];
        lista.forEach((p) => {
            const up = {};
            const vals = getCalculatedValues(p);

            if (vals.plan !== null) up.produccion_planificada = vals.plan;
            if (vals.real !== null) up.produccion_real = vals.real;
            if (vals.entrega !== null) up.tiempo_entrega_cliente = vals.entrega;
            if (vals.mb !== null) up.dias_analisis_mb = vals.mb;
            if (vals.acond !== null) up.dias_acondicionamiento = vals.acond;
            if (vals.tMuertos !== null) up.tiempos_muertos = vals.tMuertos;

            // Verificar si hubo cambios reales
            let changed = false;
            for (const key in up) {
                if (up[key] !== p[key]) {
                    changed = true;
                    break;
                }
            }

            if (changed) {
                updates.push(supabase.from(st("pedidos_produccion")).update(up).eq("id", p.id));
            }
        });

        if (updates.length > 0) {
            console.log(`🔄 [Consolidado] Sincronizando ${updates.length} pedidos con cambios detectados...`);
            await Promise.all(updates);
        }
    }

    function getCalculatedValues(p) {
        const diff = (start, end) => {
            if (!start || !end) return null;
            const s = new Date(start);
            const e = new Date(end);
            const d = Math.round((e - s) / (1000 * 60 * 60 * 24));
            return isNaN(d) ? null : d;
        };

        const plan = diff(p.fecha_ingreso_produccion, p.fecha_maxima_entrega);
        const real = diff(p.fecha_ingreso_produccion, p.fecha_entrega_bodega);
        // T. Entrega: Priorizar entrega_cliente, sino entrega_bodega (tiempo proceso)
        const entrega = diff(p.fecha_recepcion_cliente, p.fecha_entrega_cliente || p.fecha_entrega_bodega);
        const mb = diff(p.fecha_entrada_mb, p.fecha_salida_mb);
        const acond = diff(p.fecha_inicio_acondicionamiento, p.fecha_fin_acondicionamiento);

        let tMuertos = null;
        if (real !== null && plan !== null) {
            const val = real - plan;
            tMuertos = val > 0 ? val : 0;
        }

        return { plan, real, entrega, mb, acond, tMuertos };
    }

    const handleFilterChange = (columna, valor) => {
        setFiltros(prev => ({ ...prev, [columna]: valor }));
        setPagina(1); // Reset a primera página al filtrar
    };

    // Filtrado en el cliente para máxima velocidad (tipo Excel)
    const pedidosFiltrados = useMemo(() => {
        return pedidos.filter(p => {
            const matchId = String(p.id).includes(filtros.id);
            const matchCliente = (p.clientes?.nombre || "").toLowerCase().includes(filtros.cliente.toLowerCase());
            const matchProducto = (p.productos?.articulo || "").toLowerCase().includes(filtros.producto.toLowerCase());
            const matchEstado = (p.estados?.nombre || "").toLowerCase().includes(filtros.estado.toLowerCase());
            const matchPrioridad = (p.prioridad || "").toLowerCase().includes(filtros.prioridad.toLowerCase());
            const matchFecha = (p.fecha_recepcion_cliente || "").includes(filtros.fecha);

            return matchId && matchCliente && matchProducto && matchEstado && matchPrioridad && matchFecha;
        });
    }, [pedidos, filtros]);

    // Calcular pedidos por página
    const totalPaginas = Math.ceil(pedidosFiltrados.length / registrosPorPagina);
    const inicio = (pagina - 1) * registrosPorPagina;
    const pedidosPaginados = pedidosFiltrados.slice(inicio, inicio + registrosPorPagina);

    // Función para descargar CSV
    const downloadCSV = () => {
        if (!pedidosFiltrados.length) return;

        // Definir encabezados y mapeo de datos
        const headers = [
            "ID", "Cliente", "Producto", "Prioridad", "Estado", "Cantidad", "Fecha Recepción",
            "Entregado", "F. Entrega Cliente", "F. Ingreso Prod.", "OP", "Lote", "F. Vencimiento",
            "Tam. Lote", "% Desp.", "F. Máxima", "F. Propuesta", "F. Inicio Prod.", "F. Entrada MB",
            "F. Salida MB", "F. Liberación PT", "F. Entrega Bodega", "Planificada", "P. Real",
            "T. Entrega", "Días MB", "Días Acond.", "T. Muertos", "Cat. T. Muerto",
            "F. Entrega MM.PP.", "F. Inicio Acond.", "F. Fin Acond.", "F. Solicitud MM.PP."
        ];

        const rows = pedidosFiltrados.map(p => {
            const c = getCalculatedValues(p);
            return [
                p.id,
                p.clientes?.nombre || "",
                p.productos?.articulo || "",
                p.prioridad || "",
                p.estados?.nombre || "",
                p.cantidad,
                p.fecha_recepcion_cliente || "",
                p.entregado_cliente ? "SI" : "NO",
                p.fecha_entrega_cliente || "",
                p.fecha_ingreso_produccion || "",
                p.op || "",
                p.lote || "",
                p.fecha_vencimiento || "",
                p.tamano_lote || "",
                p.porcentaje_desperdicio || "",
                p.fecha_maxima_entrega || "",
                p.fecha_propuesta_entrega || "",
                p.fecha_inicio_produccion || "",
                p.fecha_entrada_mb || "",
                p.fecha_salida_mb || "",
                p.fecha_liberacion_pt || "",
                p.fecha_entrega_bodega || "",
                c.plan ?? "",
                c.real ?? "",
                c.entrega ?? "",
                c.mb ?? "",
                c.acond ?? "",
                c.tMuertos ?? "",
                p.categoria_tiempo_muerto || "",
                p.fecha_entrega_de_materias_primas_e_insumos || "",
                p.fecha_inicio_acondicionamiento || "",
                p.fecha_fin_acondicionamiento || "",
                p.fecha_solicitud_materias_primas || ""
            ].map(val => `"${String(val).replace(/"/g, '""')}"`); // Escapar comillas
        });

        const csvContent = [
            headers.join(","),
            ...rows.map(r => r.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `consolidado_pedidos_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const canDownload = ["gerencia", "planeacion"].includes(usuarioActual?.rol?.toLowerCase());

    return (
        <>
            <Navbar />
            <div className="consolidado-wrapper">
                <div className="consolidado-header">
                    <h1 className="consolidado-title">🗂️ Consolidado de Pedidos</h1>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <span className="consolidado-count">{pedidosFiltrados.length} pedidos encontrados</span>
                        {canDownload && (
                            <button onClick={downloadCSV} className="btn-download-csv">
                                📥 Descargar CSV
                            </button>
                        )}
                    </div>
                </div>

                <div className="consolidado-table-container">
                    <div className="consolidado-scroll-area">
                        <table className="consolidado-table">
                            <thead>
                                <tr>
                                    <th className="sticky-col sticky-col-header col-id">
                                        ID
                                        <input className="filter-input" placeholder="ID..." onChange={e => handleFilterChange("id", e.target.value)} />
                                    </th>
                                    <th className="sticky-col sticky-col-header col-cliente">
                                        Cliente
                                        <input className="filter-input" placeholder="Cliente..." onChange={e => handleFilterChange("cliente", e.target.value)} />
                                    </th>
                                    <th className="sticky-col sticky-col-header col-producto">
                                        Producto
                                        <input className="filter-input" placeholder="Producto..." onChange={e => handleFilterChange("producto", e.target.value)} />
                                    </th>

                                    <th>Prioridad <input className="filter-input" placeholder="Filtro..." onChange={e => handleFilterChange("prioridad", e.target.value)} /></th>
                                    <th>Estado <input className="filter-input" placeholder="Estado..." onChange={e => handleFilterChange("estado", e.target.value)} /></th>
                                    <th>Cant.</th>
                                    <th>Fecha Recepción <input className="filter-input" placeholder="YYYY-MM-DD" onChange={e => handleFilterChange("fecha", e.target.value)} /></th>

                                    <th>Entregado</th>
                                    <th>F. Entrega Cliente</th>
                                    <th>F. Ingreso Prod.</th>
                                    <th>OP</th>
                                    <th>Lote</th>
                                    <th>F. Vencimiento</th>
                                    <th>Tam. Lote</th>
                                    <th>% Desp.</th>
                                    <th>F. Máxima</th>
                                    <th>F. Propuesta</th>
                                    <th>F. Inicio Prod.</th>
                                    <th>F. Entrada MB</th>
                                    <th>F. Salida MB</th>
                                    <th>F. Liberación PT</th>
                                    <th>F. Entrega Bodega</th>
                                    <th>Planificada</th>
                                    <th>P. Real</th>
                                    <th>T. Entrega</th>
                                    <th>Días MB</th>
                                    <th>Días Acond.</th>
                                    <th>T. Muertos</th>
                                    <th>Cat. T. Muerto</th>
                                    <th>F. Entrega MM.PP.</th>
                                    <th>F. Inicio Acond.</th>
                                    <th>F. Fin Acond.</th>
                                    <th>F. Solicitud MM.PP.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="35" style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>Cargando registros consolidados...</td></tr>
                                ) : pedidosPaginados.length === 0 ? (
                                    <tr><td colSpan="35" style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>No se encontraron pedidos que coincidan con la búsqueda.</td></tr>
                                ) : (
                                    pedidosPaginados.map((p) => {
                                        const c = getCalculatedValues(p);
                                        return (
                                            <tr key={p.id}>
                                                <td className="sticky-col col-id id-cell">#{p.id}</td>
                                                <td className="sticky-col col-cliente">{p.clientes?.nombre || "Sin Cliente"}</td>
                                                <td className="sticky-col col-producto" title={p.productos?.articulo}>
                                                    {p.productos?.articulo || "Sin Producto"}
                                                </td>

                                                <td>
                                                    <span className={`badge badge-${(p.prioridad || "bajo").toLowerCase()}`}>
                                                        {p.prioridad || "BAJO"}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="state-label">
                                                        {p.estados?.nombre || "-"}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: "center" }}>{p.cantidad}</td>
                                                <td>{p.fecha_recepcion_cliente || "-"}</td>

                                                <td style={{ textAlign: "center" }}>
                                                    {p.entregado_cliente ? "✅ SI" : "❌ NO"}
                                                </td>
                                                <td>{p.fecha_entrega_cliente || "-"}</td>
                                                <td>{p.fecha_ingreso_produccion || "-"}</td>
                                                <td>{p.op || "-"}</td>
                                                <td>{p.lote || "-"}</td>
                                                <td>{p.fecha_vencimiento || "-"}</td>
                                                <td>{p.tamano_lote || "-"}</td>
                                                <td style={{ textAlign: "right" }}>{p.porcentaje_desperdicio ? `${p.porcentaje_desperdicio}%` : "-"}</td>
                                                <td>{p.fecha_maxima_entrega || "-"}</td>
                                                <td>{p.fecha_propuesta_entrega || "-"}</td>
                                                <td>{p.fecha_inicio_produccion || "-"}</td>
                                                <td>{p.fecha_entrada_mb || "-"}</td>
                                                <td>{p.fecha_salida_mb || "-"}</td>
                                                <td>{p.fecha_liberacion_pt || "-"}</td>
                                                <td>{p.fecha_entrega_bodega || "-"}</td>
                                                <td style={{ textAlign: "center" }}>{c.plan ?? "-"}</td>
                                                <td style={{ textAlign: "center" }}>{c.real ?? "-"}</td>
                                                <td style={{ textAlign: "center" }}>{c.entrega ?? "-"}</td>
                                                <td style={{ textAlign: "center" }}>{c.mb ?? "-"}</td>
                                                <td style={{ textAlign: "center" }}>{c.acond ?? "-"}</td>
                                                <td style={{ textAlign: "center" }}>{c.tMuertos ?? "-"}</td>
                                                <td>{p.categoria_tiempo_muerto || "-"}</td>
                                                <td>{p.fecha_entrega_de_materias_primas_e_insumos || "-"}</td>
                                                <td>{p.fecha_inicio_acondicionamiento || "-"}</td>
                                                <td>{p.fecha_fin_acondicionamiento || "-"}</td>
                                                <td>{p.fecha_solicitud_materias_primas || "-"}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>


                {/* PAGINACIÓN CONTROLES */}
                {totalPaginas > 1 && (
                    <div className="consolidado-pagination">
                        <button
                            disabled={pagina === 1}
                            onClick={() => setPagina(p => p - 1)}
                            className="page-btn"
                        >
                            Anterior
                        </button>
                        <span className="page-info">Página {pagina} de {totalPaginas}</span>
                        <button
                            disabled={pagina === totalPaginas}
                            onClick={() => setPagina(p => p + 1)}
                            className="page-btn"
                        >
                            Siguiente
                        </button>
                    </div>
                )}
            </div>
            <Footer />
        </>
    );
}
