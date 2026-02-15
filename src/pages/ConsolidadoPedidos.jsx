import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar.jsx";
import Footer from "../components/Footer";
import "./ConsolidadoPedidos.css";

export default function ConsolidadoPedidos() {
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
            .from("pedidos_produccion")
            .select(`
        *,
        cliente:clientes(nombre),
        producto:productos(articulo),
        estado:estados(nombre)
      `)
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
            let changed = false;

            if (p.produccion_planificada == null && p.fecha_maxima_entrega && p.fecha_ingreso_produccion) {
                const dias = Math.round(diffDias(p.fecha_ingreso_produccion, p.fecha_maxima_entrega));
                if (!isNaN(dias)) { up.produccion_planificada = dias; changed = true; }
            }

            if (p.fecha_entrega_bodega && p.fecha_ingreso_produccion) {
                const dias = Math.round(diffDias(p.fecha_ingreso_produccion, p.fecha_entrega_bodega));
                if (!isNaN(dias)) {
                    if (p.produccion_real == null) { up.produccion_real = dias; changed = true; }
                    if (p.tiempo_entrega_cliente == null) { up.tiempo_entrega_cliente = dias; changed = true; }
                }
            }

            if (p.dias_analisis_mb == null && p.fecha_salida_mb && p.fecha_entrada_mb) {
                const dias = Math.round(diffDias(p.fecha_entrada_mb, p.fecha_salida_mb));
                if (!isNaN(dias)) { up.dias_analisis_mb = dias; changed = true; }
            }

            if (p.dias_acondicionamiento == null && p.fecha_fin_acondicionamiento && p.fecha_inicio_acondicionamiento) {
                const dias = Math.round(diffDias(p.fecha_inicio_acondicionamiento, p.fecha_fin_acondicionamiento));
                if (!isNaN(dias)) { up.dias_acondicionamiento = dias; changed = true; }
            }

            if (changed) {
                updates.push(supabase.from("pedidos_produccion").update(up).eq("id", p.id));
            }
        });

        if (updates.length > 0) {
            console.log(`🔄 [Consolidado] Sincronizando ${updates.length} pedidos...`);
            await Promise.all(updates);
        }
    }

    const handleFilterChange = (columna, valor) => {
        setFiltros(prev => ({ ...prev, [columna]: valor }));
        setPagina(1); // Reset a primera página al filtrar
    };

    // Filtrado en el cliente para máxima velocidad (tipo Excel)
    const pedidosFiltrados = useMemo(() => {
        return pedidos.filter(p => {
            const matchId = String(p.id).includes(filtros.id);
            const matchCliente = (p.cliente?.nombre || "").toLowerCase().includes(filtros.cliente.toLowerCase());
            const matchProducto = (p.producto?.articulo || "").toLowerCase().includes(filtros.producto.toLowerCase());
            const matchEstado = (p.estado?.nombre || "").toLowerCase().includes(filtros.estado.toLowerCase());
            const matchPrioridad = (p.prioridad || "").toLowerCase().includes(filtros.prioridad.toLowerCase());
            const matchFecha = (p.fecha_recepcion_cliente || "").includes(filtros.fecha);

            return matchId && matchCliente && matchProducto && matchEstado && matchPrioridad && matchFecha;
        });
    }, [pedidos, filtros]);

    // Calcular pedidos por página
    const totalPaginas = Math.ceil(pedidosFiltrados.length / registrosPorPagina);
    const inicio = (pagina - 1) * registrosPorPagina;
    const pedidosPaginados = pedidosFiltrados.slice(inicio, inicio + registrosPorPagina);

    return (
        <>
            <Navbar />
            <div className="consolidado-wrapper">
                <div className="consolidado-header">
                    <h1 className="consolidado-title">🗂️ Consolidado de Pedidos</h1>
                    <span className="consolidado-count">{pedidosFiltrados.length} pedidos encontrados</span>
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
                                    <th>P. Planificada</th>
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
                                    pedidosPaginados.map((p) => (
                                        <tr key={p.id}>
                                            <td className="sticky-col col-id id-cell">#{p.id}</td>
                                            <td className="sticky-col col-cliente">{p.cliente?.nombre || "Sin Cliente"}</td>
                                            <td className="sticky-col col-producto" title={p.producto?.articulo}>
                                                {p.producto?.articulo || "Sin Producto"}
                                            </td>

                                            <td>
                                                <span className={`badge badge-${(p.prioridad || "bajo").toLowerCase()}`}>
                                                    {p.prioridad || "BAJO"}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="state-label">
                                                    {p.estado?.nombre || "-"}
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
                                            <td style={{ textAlign: "center" }}>{p.produccion_planificada || "-"}</td>
                                            <td style={{ textAlign: "center" }}>{p.produccion_real || "-"}</td>
                                            <td style={{ textAlign: "center" }}>{p.tiempo_entrega_cliente || "-"}</td>
                                            <td style={{ textAlign: "center" }}>{p.dias_analisis_mb || "-"}</td>
                                            <td style={{ textAlign: "center" }}>{p.dias_acondicionamiento || "-"}</td>
                                            <td>{p.tiempos_muertos || "-"}</td>
                                            <td>{p.categoria_tiempo_muerto || "-"}</td>
                                            <td>{p.fecha_entrega_de_materias_primas_e_insumos || "-"}</td>
                                            <td>{p.fecha_inicio_acondicionamiento || "-"}</td>
                                            <td>{p.fecha_fin_acondicionamiento || "-"}</td>
                                            <td>{p.fecha_solicitud_materias_primas || "-"}</td>
                                        </tr>
                                    ))
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
