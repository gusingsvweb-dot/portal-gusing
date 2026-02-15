// src/pages/ControlCalidad.jsx
import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import { notifyRoles, checkAndNotifyFlowCompletion } from "../api/notifications";
import "../pages/Produccion.css";

function ahoraISO() {
  return new Date().toISOString();
}

/* ===========================================================
   COMPONENTE COLLAPSIBLE PARA SIDEBAR
=========================================================== */
function SidebarSection({ title, count, children, isOpen, onToggle }) {
  return (
    <div className="mb-sidebar-section">
      <div className="mb-sidebar-header" onClick={onToggle}>
        <span className={`arrow ${isOpen ? "open" : ""}`}>▶</span>
        <span className="mb-sidebar-title">
          {title} <span className="mb-sidebar-count">({count})</span>
        </span>
      </div>
      {isOpen && (
        <div className="mb-sidebar-content">
          {count === 0 ? (
            <p className="mb-empty-section">No hay nada pendiente</p>
          ) : children}
        </div>
      )}
    </div>
  );
}

export default function ControlCalidad() {
  const { usuarioActual } = useAuth();
  const usuarioId = usuarioActual?.id ?? null; // UUID from Supabase Auth

  const [etapas, setEtapas] = useState([]);
  const [pedidosPT, setPedidosPT] = useState([]);
  const [selected, setSelected] = useState(null); // { ...item, tipoItem: 'etapa' | 'pt' }
  const [obs, setObs] = useState([]);
  const [newObs, setNewObs] = useState("");

  // Accordion Sidebar
  const [expanded, setExpanded] = useState({
    etapas: false,
    pt: false
  });

  const [responsables, setResponsables] = useState([]);
  const [claveInput, setClaveInput] = useState("");

  const toggleSection = (sec) => {
    setExpanded(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  // NUEVO: Ref para evitar cierres obsoletos (stale closures)
  const newObsRef = React.useRef("");
  useEffect(() => {
    newObsRef.current = newObs;
  }, [newObs]);

  const [microAreaId, setMicroAreaId] = useState(null);
  const [microLiberado, setMicroLiberado] = useState(true);
  const [microLoading, setMicroLoading] = useState(false);
  const [microStatusMsg, setMicroStatusMsg] = useState("");

  // ==========================
  // CONFIRMACIÓN DE ACCIONES
  // ==========================
  const [confirmData, setConfirmData] = useState({
    isOpen: false,
    msg: "",
    title: "",
    type: "info",
    isRejection: false,
    isChoice: false,
    showComment: false,
    errorMessage: "",
    action: null,
    numeroAnalisis: "",
    responsableManual: ""
  });

  function pedirConfirmacion(title, mensaje, accion, isRejection = false, isChoice = false) {
    setConfirmData({
      isOpen: true,
      title: title,
      msg: mensaje,
      type: isRejection ? "danger" : "info",
      isRejection: isRejection,
      isChoice: isChoice,
      showComment: isRejection,
      errorMessage: "",
      action: accion,
    });
  }

  function cerrarConfirmacion() {
    setConfirmData({
      isOpen: false, msg: "", title: "", action: null,
      isRejection: false, isChoice: false, showComment: false, errorMessage: "",
      numeroAnalisis: "", responsableManual: ""
    });
    setNewObs(""); // Limpiar para el siguiente
    setClaveInput(""); // Limpiar clave
  }

  async function ejecutarConfirmacion() {
    const currentObs = newObsRef.current;
    if (confirmData.isRejection && !currentObs.trim()) {
      setConfirmData(prev => ({ ...prev, errorMessage: "Es obligatorio indicar el motivo del rechazo." }));
      return;
    }

    // VERIFICACIÓN DE RESPONSABLE (Solo si es liberación)
    if (!confirmData.isRejection) {
      if (!confirmData.responsableManual) {
        setConfirmData(prev => ({ ...prev, errorMessage: "Debe seleccionar un responsable." }));
        return;
      }
      if (!claveInput.trim()) {
        setConfirmData(prev => ({ ...prev, errorMessage: "Debe ingresar su clave personal." }));
        return;
      }

      // Buscar el responsable en la lista cargada
      const respObj = responsables.find(r => r.nombre === confirmData.responsableManual);
      if (!respObj || respObj.clave !== claveInput) {
        setConfirmData(prev => ({ ...prev, errorMessage: "Clave personal incorrecta." }));
        return;
      }
    }

    if (confirmData.action) {
      await confirmData.action(currentObs, confirmData.numeroAnalisis, confirmData.responsableManual);
    }
    cerrarConfirmacion();
  }

  // ==========================
  // HISTORIAL
  // ==========================
  const [historial, setHistorial] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const ITEMS = 8;

  /* ===========================================================
     CARGAR ETAPAS PENDIENTES DE LIBERACIÓN (CC)
  =========================================================== */
  async function loadEtapas() {
    const { data, error } = await supabase
      .from("pedido_etapas")
      .select(`
        *,
        pedidos_produccion (
          id,
          cantidad,
          op,
          lote,
          fecha_vencimiento,
          productos ( articulo, forma_farmaceutica ),
          clientes ( nombre )
        )
      `)
      .eq("requiere_liberacion", true)
      .ilike("rol_liberador", "%control_calidad%")
      .eq("estado", "en_revision")
      .order("fecha_inicio", { ascending: true });

    if (error) {
      console.error("❌ Error cargando etapas CC:", error);
      return;
    }

    setEtapas(data || []);
  }

  // Cargar pedidos para liberación PT (Estado 10)
  async function loadPedidosPT() {
    const { data, error } = await supabase
      .from("pedidos_produccion")
      .select(`
        *,
        productos ( articulo, forma_farmaceutica ),
        clientes ( nombre ),
        estados ( nombre )
      `)
      .eq("estado_id", 10) // Liberación PT
      .order("id", { ascending: true });

    if (error) console.error("Error cargando pedidos PT:", error);
    setPedidosPT(data || []);
  }

  // Cargar áreas para identificar Microbiología
  useEffect(() => {
    async function cargarCatalogos() {
      const { data: areas } = await supabase.from("areas").select("*");
      const mb = (areas || []).find(x => (x.nombre || "").toLowerCase().includes("micro"));
      setMicroAreaId(mb?.id || null);

      // Cargar responsables de liberación (CC)
      const { data: resp } = await supabase
        .from("responsables_liberacion")
        .select("*")
        .eq("area", "control_calidad")
        .eq("activo", true);
      setResponsables(resp || []);
    }
    cargarCatalogos();
  }, []);

  /* ===========================================================
     FILTROS (Memo)
  =========================================================== */
  const etapasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return etapas;
    return etapas.filter(e =>
      e.nombre.toLowerCase().includes(q) ||
      e.pedidos_produccion?.productos?.articulo?.toLowerCase().includes(q) ||
      e.pedidos_produccion?.clientes?.nombre?.toLowerCase().includes(q) ||
      String(e.pedido_id).includes(q)
    );
  }, [etapas, busqueda]);

  const pedidosPTFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return pedidosPT;
    return pedidosPT.filter(p =>
      p.productos?.articulo?.toLowerCase().includes(q) ||
      p.clientes?.nombre?.toLowerCase().includes(q) ||
      String(p.consecutivo || p.id).includes(q)
    );
  }, [pedidosPT, busqueda]);

  async function loadTodo() {
    await Promise.all([
      loadEtapas(),
      loadPedidosPT(),
      loadHistorial()
    ]);
  }

  // Se llama en useEffect
  useEffect(() => {
    loadTodo();
  }, []);

  /* ===========================================================
     CHECK MICROBIOLOGÍA (Requisito para liberación de PT)
  =========================================================== */
  async function checkMicroStatus(pedidoId, item) {
    if (!microAreaId) return true;
    setMicroLoading(true);
    setMicroStatusMsg("");

    const formaProd = (item?.productos?.forma_farmaceutica || "").toLowerCase();
    const esEsteril = formaProd.includes("esteril") || formaProd.includes("estéril");
    const keywordBuscada = esEsteril ? "esterilidad" : "envasado";
    const displayName = esEsteril ? "Esterilidad" : "Envasado";

    console.log("🔍 DEBUG checkMicroStatus:", {
      pedidoId,
      microAreaId,
      formaProd,
      esEsteril,
      keywordBuscada
    });

    // Buscamos todas las solicitudes de Microbiología
    const { data, error } = await supabase
      .from("solicitudes")
      .select("id, descripcion, estado_id, consecutivo")
      .eq("area_id", microAreaId);

    if (error) {
      console.error("❌ Error Supabase checkMicroStatus:", error);
      setMicroLoading(false);
      setMicroStatusMsg(`Error DB: ${error.message || 'Error desconocido'}`);
      return false;
    }

    // Filtrar localmente por consecutivo (muy robusto: string vs number)
    const pidStr = String(pedidoId);
    const solicitudesPedido = (data || []).filter(s => String(s.consecutivo) === pidStr);

    console.log(`🔍 DATA Solicitudes Filtradas para Pedido ${pidStr}:`, solicitudesPedido);

    // Filtrar solicitudes por la palabra clave
    let solicitudesRelevantes = solicitudesPedido.filter(s => {
      const desc = (s.descripcion || "").toLowerCase();
      return desc.includes(keywordBuscada) ||
        desc.includes("esterilización") ||
        desc.includes("inicial") ||
        desc.includes("muestreo") ||
        desc.includes("biocarga");
    });

    // Si hay solicitudes en el pedido pero ninguna pasó el filtro de palabras clave,
    // es mejor confiar en que esas solicitudes SON del pedido aunque tengan otro nombre.
    if (solicitudesPedido.length > 0 && solicitudesRelevantes.length === 0) {
      console.warn("⚠️ Se encontraron solicitudes pero ninguna coincide con los filtros específicos. Tomando todas como válidas.");
      solicitudesRelevantes = solicitudesPedido;
    }

    if (solicitudesRelevantes.length === 0) {
      setMicroLiberado(false);
      setMicroStatusMsg(`Falta solicitud de análisis de ${displayName} en Microbiología.`);
      setMicroLoading(false);
      return false;
    }

    const tienePendientes = solicitudesRelevantes.some(s => s.estado_id !== 2);

    if (tienePendientes) {
      setMicroLiberado(false);
      setMicroStatusMsg(`Análisis de ${displayName} pendiente en Microbiología.`);
    } else {
      setMicroLiberado(true);
      setMicroStatusMsg(`Análisis de ${displayName} completado por Microbiología. Liberación permitida.`);
    }

    setMicroLoading(false);
    return !tienePendientes;
  }

  // Modificar seleccionarItem para incluir el check
  async function seleccionarItem(item, tipo) {
    setSelected({ ...item, tipoItem: tipo });
    const pid = tipo === 'etapa' ? item.pedido_id : item.id;
    cargarObservaciones(pid);

    if (tipo === 'pt') {
      await checkMicroStatus(item.id, item);
    } else {
      setMicroLiberado(true);
      setMicroStatusMsg("");
    }
  }

  /* ===========================================================
     HISTORIAL CC (etapas completadas + PT liberados)
  =========================================================== */
  async function loadHistorial() {
    // 1) Etapas intermedias liberadas por CC
    const { data: dataEtapas, error: errEtapas } = await supabase
      .from("pedido_etapas_liberaciones")
      .select(`
        id,
        created_at,
        comentario,
        pedido_etapas (
          id,
          nombre,
          pedido_id,
          pedidos_produccion (
            op,
            lote,
            productos ( articulo ),
            clientes ( nombre )
          )
        )
      `)
      .eq("rol", "control_calidad")
      .eq("liberada", true)
      .order("created_at", { ascending: false })
      .limit(20);

    // 2) Producto Terminado (Pedidos con fecha_liberacion_pt)
    const { data: dataPT, error: errPT } = await supabase
      .from("pedidos_produccion")
      .select(`
        id,
        fecha_liberacion_pt,
        cantidad,
        op,
        lote,
        productos ( articulo ),
        clientes ( nombre )
      `)
      .not("fecha_liberacion_pt", "is", null)
      .order("fecha_liberacion_pt", { ascending: false })
      .limit(20);

    if (errEtapas || errPT) {
      console.error("❌ Error historial CC:", errEtapas || errPT);
      return;
    }

    // Normalizar datos para la tabla
    const hEtapas = (dataEtapas || []).map(l => ({
      id: `et-lib-${l.id}`,
      tipo: 'Etapa Intermedia',
      pedidoId: l.pedido_etapas?.pedido_id,
      articulo: l.pedido_etapas?.pedidos_produccion?.productos?.articulo,
      cliente: l.pedido_etapas?.pedidos_produccion?.clientes?.nombre,
      op: l.pedido_etapas?.pedidos_produccion?.op,
      lote: l.pedido_etapas?.pedidos_produccion?.lote,
      detalle: l.pedido_etapas?.nombre,
      fecha: l.created_at
    }));

    const hPT = (dataPT || []).map(p => ({
      id: `pt-${p.id}`,
      originalId: p.id,
      tipo: 'Producto Terminado',
      pedidoId: p.id,
      articulo: p.productos?.articulo,
      cliente: p.clientes?.nombre,
      op: p.op,
      lote: p.lote,
      detalle: 'Liberación Final PT',
      fecha: p.fecha_liberacion_pt
    }));

    const merged = [...hEtapas, ...hPT].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    setHistorial(merged);
  }

  // Se eliminó el useEffect anterior para unificarlo arriba


  /* ===========================================================
     OBSERVACIONES
  =========================================================== */
  async function cargarObservaciones(pedidoId) {
    const { data } = await supabase
      .from("observaciones_pedido")
      .select("*")
      .eq("pedido_id", pedidoId)
      .order("created_at", { ascending: false });

    setObs(data || []);
  }



  async function addObs() {
    if (!newObs.trim() || !selected) return;

    await supabase.from("observaciones_pedido").insert([
      {
        pedido_id: selected.tipoItem === 'etapa' ? selected.pedido_id : selected.id,
        usuario: "control_calidad",
        observacion: newObs,
      },
    ]);

    setNewObs("");
    cargarObservaciones(selected.tipoItem === 'etapa' ? selected.pedido_id : selected.id);
  }

  /* ===========================================================
     LIBERAR ETAPA (CONTROL DE CALIDAD)
  =========================================================== */
  async function liberarEtapa() {
    if (!selected || selected.tipoItem !== 'etapa') return;

    pedirConfirmacion(
      "✅ Liberar Etapa",
      `¿Deseas dejar una observación antes de liberar la etapa "${selected.nombre}"?`,
      async (currentObs, nAnalisis, respManual) => {
        // 1) Marcar liberación
        const updateData = {
          liberada: true,
          usuario_id: usuarioId,
          comentario: currentObs || "Liberado por Control Calidad."
        };
        // Agregar campos opcionales si existen
        if (nAnalisis) updateData.numero_analisis = nAnalisis;
        if (respManual) updateData.responsable_manual = respManual;

        const { error: errLib } = await supabase
          .from("pedido_etapas_liberaciones")
          .update(updateData)
          .eq("pedido_etapa_id", selected.id)
          .eq("rol", "control_calidad");

        if (errLib) {
          console.error("❌ Error al liberar etapa (liberaciones):", errLib);
          alert(`Error al liberar: ${errLib.message}`);
          return;
        }

        // 2) Verificar si ya todos liberaron para cerrar etapa
        const { data: todasLibs, error: errCheck } = await supabase
          .from("pedido_etapas_liberaciones")
          .select("liberada")
          .eq("pedido_etapa_id", selected.id);

        if (errCheck) {
          console.error("❌ Error check todas las libs:", errCheck);
        }

        const todasListas = todasLibs && todasLibs.length > 0 && todasLibs.every(l => l.liberada);

        if (todasListas) {
          const { error } = await supabase
            .from("pedido_etapas")
            .update({
              estado: "completada",
              fecha_fin: ahoraISO(),
            })
            .eq("id", selected.id);

          if (error) {
            alert("❌ Error completando la etapa.");
            return;
          }
        }

        // 2.5) Guardar en historial oficial si hay comentario
        if (currentObs && currentObs.trim()) {
          await supabase.from("observaciones_pedido").insert({
            pedido_id: selected.pedido_id,
            usuario: usuarioActual?.usuario || "Control Calidad",
            observacion: `✅ ETAPA LIBERADA (${selected.nombre}): ${currentObs}`,
          });
        }

        // 3) Notificar a Producción
        await notifyRoles(
          ["produccion"],
          "Etapa Liberada (CC)",
          `Calidad ha liberado la etapa "${selected.nombre}" del pedido #${selected.pedido_id}.`,
          selected.pedido_id,
          "proceso_completado"
        );

        // 4) Verificar si todo el flujo terminó
        await checkAndNotifyFlowCompletion(selected.pedido_id);

        alert("✔ Etapa liberada por Control de Calidad");
        setSelected(null);
        setObs([]);
        await loadTodo();
      },
      false, // isRejection
      true   // isChoice
    );
  }

  async function rechazarEtapa() {
    if (!selected || selected.tipoItem !== 'etapa') return;

    pedirConfirmacion(
      "↩ Rechazar Etapa",
      `Estás rechazando la etapa "${selected.nombre}". Es obligatorio indicar el motivo; este se guardará en el historial de observaciones del pedido.`,
      async (currentObs) => {
        // 1) Guardar en liberaciones
        const { error: errLib } = await supabase
          .from("pedido_etapas_liberaciones")
          .update({
            liberada: false,
            usuario_id: usuarioId,
            comentario: currentObs
          })
          .eq("pedido_etapa_id", selected.id)
          .eq("rol", "control_calidad");

        if (errLib) {
          console.error("❌ Error al rechazar etapa (liberaciones):", errLib);
          alert(`Error al rechazar: ${errLib.message}`);
          return;
        }

        // 2) Devolver a pendiente
        const { error: errEtapa } = await supabase
          .from("pedido_etapas")
          .update({ estado: "pendiente" })
          .eq("id", selected.id);

        if (errEtapa) {
          console.error("❌ Error al devolver etapa a pendiente:", errEtapa);
          alert(`Error al devolver a pendiente: ${errEtapa.message}`);
          return;
        }

        // 3) Guardar observación oficial del pedido
        await supabase.from("observaciones_pedido").insert({
          pedido_id: selected.pedido_id,
          usuario: usuarioActual?.usuario || "Control Calidad",
          observacion: `❌ ETAPA RECHAZADA (${selected.nombre}): ${currentObs}`,
        });

        // 4) Notificar a Producción
        await notifyRoles(
          ["produccion"],
          "Etapa Rechazada (CC)",
          `Calidad ha RECHAZADO la etapa "${selected.nombre}" del pedido #${selected.pedido_id}. Motivo: ${currentObs.substring(0, 50)}...`,
          selected.pedido_id,
          "urgente"
        );

        alert("↩ Etapa rechazada y devuelta a Producción.");
        setSelected(null);
        setObs([]);
        await loadTodo();
      },
      true // esRejection
    );
  }

  /* ===========================================================
     LIBERAR PRODUCTO TERMINADO (PT)
  =========================================================== */
  async function liberarPT() {
    if (!selected || selected.tipoItem !== 'pt') return;

    pedirConfirmacion(
      "📦 Liberar Producto Terminado",
      `¿Deseas agregar el resultado final del análisis como observación para este pedido?`,
      async (currentObs, nAnalisis, respManual) => {
        const fechaHoy = new Date().toISOString().slice(0, 10);
        const update = {
          estado_id: 11, // Entrega a bodega
          asignado_a: "bodega",
          fecha_liberacion_pt: fechaHoy
        };

        if (nAnalisis) update.numero_analisis_pt = nAnalisis;
        if (respManual) update.responsable_liberacion_pt = respManual;

        const { error } = await supabase
          .from("pedidos_produccion")
          .update(update)
          .eq("id", selected.id);

        if (error) {
          alert("Error liberando PT.");
          return;
        }

        // Si hubiera un comentario, lo guardamos como observación
        if (currentObs && currentObs.trim()) {
          await supabase.from("observaciones_pedido").insert({
            pedido_id: selected.id,
            usuario: usuarioActual?.usuario || "Control Calidad",
            observacion: `✅ LIBERACIÓN PT: ${currentObs}`,
          });
        }

        // Notificar a Bodega
        await notifyRoles(
          ["bodega"],
          "Pedido Liberado por Calidad",
          `El pedido #${selected.id} ha sido liberado por Calidad y está listo para despacho en Bodega.`,
          selected.id,
          "proceso_completado"
        );

        alert("✔ Producto Terminado liberado. Enviado a Bodega para despacho.");
        setSelected(null);
        setObs([]);
        await loadPedidosPT();
        await loadHistorial();
      },
      false, // isRejection
      true   // isChoice
    );
  }

  /* ===========================================================
     FILTROS HISTORIAL
  =========================================================== */
  const filtrado = historial.filter((h) =>
    `${h.articulo} ${h.cliente} ${h.tipo} ${h.pedidoId}`
      .toLowerCase()
      .includes(busqueda.toLowerCase())
  );

  const paginas = Math.ceil(filtrado.length / ITEMS);
  const pag = Math.min(pagina, paginas || 1);
  const inicio = (pag - 1) * ITEMS;
  const lista = filtrado.slice(inicio, inicio + ITEMS);

  /* ===========================================================
     RENDER
  =========================================================== */
  return (
    <>
      <Navbar />

      <div className="pc-wrapper">
        {/* LISTA IZQUIERDA */}
        <div className="mb-list">
          <h3>📥 Pendientes</h3>
          <div className="mb-filters">
            <input
              className="mb-search"
              placeholder="Buscar por producto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <SidebarSection
            title="Etapas Intermedias"
            count={etapasFiltradas.length}
            isOpen={expanded.etapas}
            onToggle={() => toggleSection("etapas")}
          >
            {etapasFiltradas.map((e) => (
              <div
                key={e.id}
                className={`mb-item ${selected?.id === e.id && selected?.tipoItem === 'etapa' ? "mb-item-selected" : ""}`}
                onClick={() => seleccionarItem(e, 'etapa')}
              >
                <div className="mb-item-top">
                  <span className="mb-id">ID PED: #{e.id} | PEDIDO: #{e.pedido_id}</span>
                  <span className="mb-chip">EN REVISIÓN</span>
                </div>
                <p className="mb-title">{e.pedidos_produccion?.productos?.articulo || 'Sin Producto'}</p>
                <p className="mb-sub"><strong>Etapa:</strong> {e.nombre}</p>
              </div>
            ))}
          </SidebarSection>

          <SidebarSection
            title="Producto Terminado"
            count={pedidosPTFiltrados.length}
            isOpen={expanded.pt}
            onToggle={() => toggleSection("pt")}
          >
            {pedidosPTFiltrados.map((p) => (
              <div
                key={p.id}
                className={`mb-item mb-item-pt ${selected?.id === p.id && selected?.tipoItem === 'pt' ? "mb-item-selected" : ""}`}
                onClick={() => seleccionarItem(p, 'pt')}
              >
                <div className="mb-item-top">
                  <span className="mb-id">ID PEDIDO: #{p.consecutivo || p.id}</span>
                  <span className="mb-chip mb-chip-warn">LIBERACIÓN PT</span>
                </div>
                <p className="mb-title">{p.productos?.articulo || 'Sin Producto'}</p>
                <p className="mb-sub"><strong>Cliente:</strong> {p.clientes?.nombre}</p>
              </div>
            ))}
          </SidebarSection>
        </div>

        {/* DETALLE DERECHA */}
        <div className="pc-detail fadeIn" style={{ flex: 1, minWidth: 0 }}>
          {!selected ? (
            <div className="mb-card">
              <p>Selecciona un elemento para ver detalles y liberar.</p>
            </div>
          ) : (
            <>
              {/* VISTA DETALLE PARA ETAPA INTERMEDIA */}
              {selected.tipoItem === 'etapa' ? (
                <>
                  <div className="mb-card">
                    <h3>📄 Detalle de Etapa - Pedido #{selected.pedido_id}</h3>
                    <div className="mb-grid">
                      <p><strong>Producto:</strong> {selected.pedidos_produccion?.productos?.articulo || "-"}</p>
                      <p><strong>Forma Farm.:</strong> {selected.pedidos_produccion?.productos?.forma_farmaceutica || "-"}</p>
                      <p><strong>Cliente:</strong> {selected.pedidos_produccion?.clientes?.nombre || "-"}</p>
                      <p><strong>Cantidad:</strong> {selected.pedidos_produccion?.cantidad || "-"}</p>
                      <p><strong>OP:</strong> {selected.pedidos_produccion?.op || "-"}</p>
                      <p><strong>Lote:</strong> {selected.pedidos_produccion?.lote || "-"}</p>
                      <p><strong>Vence:</strong> {selected.pedidos_produccion?.fecha_vencimiento || "-"}</p>
                      <p><strong>Etapa:</strong> {selected.nombre}</p>
                    </div>
                  </div>

                  <div className="mb-card">
                    <h3>✅ Liberación de Calidad</h3>
                    <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '15px' }}>
                      Al liberar, esta etapa quedará <strong>completada</strong> y Producción podrá continuar.
                    </p>
                    <div className="mb-actions-row" style={{ marginTop: 15 }}>
                      <button className="mb-btn mb-btn-danger" onClick={rechazarEtapa}>
                        ↩ Rechazar etapa
                      </button>
                      <button className="pc-btn" style={{ flex: 1 }} onClick={liberarEtapa}>
                        ✔ Confirmar y Liberar Etapa
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* VISTA DETALLE PARA PRODUCTO TERMINADO (PT) */
                <>
                  <div className="mb-card" style={{ borderTop: "4px solid #2563eb" }}>
                    <h3>🔍 Liberación de Producto Terminado - Pedido #{selected.id}</h3>
                    <div className="mb-grid">
                      <p><strong>Producto:</strong> {selected.productos?.articulo}</p>
                      <p><strong>Forma Farm.:</strong> {selected.productos?.forma_farmaceutica || "-"}</p>
                      <p><strong>Cliente:</strong> {selected.clientes?.nombre}</p>
                      <p><strong>Cantidad:</strong> {selected.cantidad}</p>
                      <p><strong>OP:</strong> {selected.op || "-"}</p>
                      <p><strong>Lote:</strong> {selected.lote || "-"}</p>
                      <p><strong>Vence:</strong> {selected.fecha_vencimiento || "-"}</p>
                      <p><strong>Estado Actual:</strong> {selected.estados?.nombre}</p>
                    </div>
                  </div>

                  {/* BLOQUEO POR MICROBIOLOGÍA */}
                  <div className="mb-card">
                    <h3>✅ Liberación Final PT</h3>

                    {microLoading ? (
                      <p>Verificando estado de Microbiología...</p>
                    ) : (
                      <div style={{
                        background: microLiberado ? "#f0fdf4" : "#fef2f2",
                        border: microLiberado ? "1px solid #bbf7d0" : "1px solid #fecaca",
                        padding: "15px",
                        borderRadius: "10px",
                        color: microLiberado ? "#166534" : "#991b1b",
                        fontSize: "14px",
                        marginBottom: "15px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px"
                      }}>
                        <span style={{ fontSize: "20px" }}>{microLiberado ? "✔" : "⚠️"}</span>
                        <p style={{ margin: 0 }}>
                          {microStatusMsg}
                        </p>
                      </div>
                    )}

                    <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '15px' }}>
                      Revisión final tras Acondicionamiento. Si apruebas, el pedido pasará a <strong>Entrega a Bodega</strong>.
                    </p>

                    <button
                      className="pc-btn"
                      style={{
                        width: '100%',
                        background: microLiberado ? "#2563eb" : "#94a3b8",
                        cursor: microLiberado ? "pointer" : "not-allowed"
                      }}
                      onClick={liberarPT}
                      disabled={!microLiberado || microLoading}
                    >
                      {microLoading ? "Verificando..." : "✔ Aprobar y Liberar PT"}
                    </button>
                  </div>
                </>
              )}

              {/* OBSERVACIONES */}
              <div className="mb-card">
                <h3>📝 Observaciones</h3>
                <div className="pc-observaciones" style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '15px' }}>
                  {obs.length === 0 && <p className="pc-empty">No hay observaciones.</p>}
                  {obs.map((o) => (
                    <div key={o.id} className="pc-obs-item">
                      <p>{o.observacion}</p>
                      <span>
                        {o.usuario} – {new Date(o.created_at).toLocaleString("es-CO")}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pc-add-obs" style={{ display: 'flex', gap: '10px' }}>
                  <textarea
                    rows="2"
                    placeholder="+ Añadir observación…"
                    value={newObs}
                    onChange={(e) => setNewObs(e.target.value)}
                    style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                  <button className="mb-btn" onClick={addObs}>➕</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* HISTORIAL CC */}
      <div className="gc-history">
        <h2>📜 Historial Control de Calidad</h2>

        <input
          className="gc-input"
          placeholder="Buscar por producto o cliente…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        {lista.length === 0 && (
          <p className="gc-empty">No hay liberaciones registradas.</p>
        )}

        {lista.length > 0 && (
          <>
            <table className="gc-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Tipo</th>
                  <th>Producto</th>
                  <th>OP / Lote</th>
                  <th>Detalle</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((h) => (
                  <tr key={h.id}>
                    <td><strong>#{h.pedidoId}</strong></td>
                    <td><span className={`mb-chip ${h.tipo.includes('PT') ? 'mb-chip-warn' : ''}`}>{h.tipo}</span></td>
                    <td>{h.articulo}</td>
                    <td>{h.op} / {h.lote}</td>
                    <td>{h.detalle}</td>
                    <td>{new Date(h.fecha).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="gc-paginacion">
              <button disabled={pag === 1} onClick={() => setPagina((p) => p - 1)}>
                ◀ Anterior
              </button>
              <span>Página {pag} de {paginas || 1}</span>
              <button disabled={pag === paginas} onClick={() => setPagina((p) => p + 1)}>
                Siguiente ▶
              </button>
            </div>
          </>
        )}
      </div>

      <Footer />

      {/* MODAL DE CONFIRMACIÓN / RECHAZO */}
      {confirmData.isOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>{confirmData.title}</h3>
            <p style={{ marginTop: 10, color: "#475569", fontSize: 14 }}>
              {confirmData.msg}
            </p>

            {confirmData.isChoice && !confirmData.showComment && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 15 }}>
                {/* CAMPOS ADICIONALES PARA LIBERACIÓN (SOLO SI ES LIBERACIÓN) */}
                {!confirmData.isRejection && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'block', marginBottom: 5, fontWeight: 500 }}>Número de Análisis</label>
                    <input
                      type="text"
                      className="mb-input"
                      placeholder="Ej: A-12345"
                      value={confirmData.numeroAnalisis || ""}
                      onChange={(e) => setConfirmData(prev => ({ ...prev, numeroAnalisis: e.target.value }))}
                    />

                    <label style={{ display: 'block', marginTop: 10, marginBottom: 5, fontWeight: 500 }}>Responsable Liberación</label>
                    <select
                      className="mb-input"
                      value={confirmData.responsableManual || ""}
                      onChange={(e) => setConfirmData(prev => ({ ...prev, responsableManual: e.target.value }))}
                    >
                      <option value="">Seleccione responsable...</option>
                      {responsables.map(r => (
                        <option key={r.id} value={r.nombre}>{r.nombre}</option>
                      ))}
                    </select>

                    <label style={{ display: 'block', marginTop: 10, marginBottom: 5, fontWeight: 500 }}>Clave Personal</label>
                    <input
                      type="password"
                      className="mb-input"
                      placeholder="****"
                      value={claveInput}
                      onChange={(e) => setClaveInput(e.target.value)}
                    />
                  </div>
                )}

                <button
                  className="mb-btn"
                  style={{ background: "#2563eb" }}
                  onClick={() => setConfirmData(prev => ({ ...prev, showComment: true }))}
                >
                  Sí, añadir observación ✍️
                </button>
                <button
                  className="mb-btn"
                  style={{ background: "#10b981" }}
                  onClick={ejecutarConfirmacion}
                >
                  No, liberar directo ⚡
                </button>
              </div>
            )}

            {(confirmData.showComment || confirmData.isRejection) && (
              <>
                {!confirmData.isRejection && (
                  <div style={{ marginBottom: 15 }}>
                    <label style={{ display: 'block', marginBottom: 5, fontWeight: 500 }}>Número de Análisis</label>
                    <input
                      type="text"
                      className="mb-input"
                      placeholder="Ej: A-12345"
                      value={confirmData.numeroAnalisis || ""}
                      onChange={(e) => setConfirmData(prev => ({ ...prev, numeroAnalisis: e.target.value }))}
                    />

                    <label style={{ display: 'block', marginTop: 10, marginBottom: 5, fontWeight: 500 }}>Responsable Liberación</label>
                    <select
                      className="mb-input"
                      value={confirmData.responsableManual || ""}
                      onChange={(e) => setConfirmData(prev => ({ ...prev, responsableManual: e.target.value }))}
                    >
                      <option value="">Seleccione responsable...</option>
                      {responsables.map(r => (
                        <option key={r.id} value={r.nombre}>{r.nombre}</option>
                      ))}
                    </select>

                    <label style={{ display: 'block', marginTop: 10, marginBottom: 5, fontWeight: 500 }}>Clave Personal</label>
                    <input
                      type="password"
                      className="mb-input"
                      placeholder="****"
                      value={claveInput}
                      onChange={(e) => setClaveInput(e.target.value)}
                    />
                  </div>
                )}
                <textarea
                  rows="4"
                  placeholder={confirmData.isRejection ? "Escribe obligatoriamente el motivo del rechazo..." : "Escribe tu observación opcional..."}
                  value={newObs}
                  onChange={(e) => setNewObs(e.target.value)}
                  autoFocus
                />
              </>
            )}

            {confirmData.errorMessage && (
              <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8, fontWeight: 600 }}>
                ⚠️ {confirmData.errorMessage}
              </p>
            )}

            <div className="modal-footer">
              <button
                className="mb-btn"
                style={{ background: "#e2e8f0", color: "#475569" }}
                onClick={cerrarConfirmacion}
              >
                Cancelar
              </button>
              {(!confirmData.isChoice || confirmData.showComment) && (
                <button
                  className="mb-btn"
                  style={{ background: confirmData.type === 'danger' ? "#ef4444" : "#2563eb" }}
                  onClick={ejecutarConfirmacion}
                  disabled={false} // Se podría deshabilitar si faltan campos obligatorios
                >
                  Confirmar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
