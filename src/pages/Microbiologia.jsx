// src/pages/Microbiologia.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import { notifyRoles, checkAndNotifyFlowCompletion } from "../api/notifications";
import "./Microbiologia.css";

// Helpers
function ahoraISO() {
  return new Date().toISOString();
}

function toLowerSafe(str) {
  return (str || "").toLowerCase();
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

export default function Microbiologia() {
  const { usuarioActual } = useAuth(); // { usuario, rol, areadetrabajo, ... }
  const rolUsuario = usuarioActual?.rol || "microbiologia";

  // Listas izquierda (divididas como en CC)
  const [etapas, setEtapas] = useState([]); // Etapas intermedias (pedido_etapas)
  const [solicitudesIniciales, setSolicitudesIniciales] = useState([]); // Solicitud inicial (tabla solicitudes)
  const [loading, setLoading] = useState(false);

  // Selección
  const [selected, setSelected] = useState(null); // { item, tipoItem: 'etapa' | 'solicitud' }

  // Accordion Sidebar
  const [expanded, setExpanded] = useState({
    iniciales: false,
    intermedias: false
  });

  const toggleSection = (sec) => {
    setExpanded(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  // Historial / liberaciones
  const [historial, setHistorial] = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  // UI / Otros
  const [areaMicroId, setAreaMicroId] = useState(null);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [comentario, setComentario] = useState("");
  const [accionLoading, setAccionLoading] = useState(false);

  const [responsables, setResponsables] = useState([]);
  const [claveInput, setClaveInput] = useState("");

  const [historialGlobal, setHistorialGlobal] = useState([]);
  const [busquedaGlobal, setBusquedaGlobal] = useState("");

  // NUEVO: Ref para evitar cierres obsoletos (stale closures)
  const commentRef = React.useRef("");
  useEffect(() => {
    commentRef.current = comentario;
  }, [comentario]);

  // ==========================
  // CONFIRMACIÓN DE ACCIONES (estilo Producción)
  // ==========================
  const [confirmData, setConfirmData] = useState({
    isOpen: false,
    msg: "",
    title: "",
    type: "info", // "info" | "danger"
    isRejection: false,
    isChoice: false, // Nuevo: para preguntar "¿Deseas observación?"
    showComment: false, // Nuevo: para mostrar el textarea tras elegir "Sí"
    errorMessage: "",
    action: null,
    numeroAnalisis: "",
    responsableManual: ""
  });

  function pedirConfirmacion(title, mensaje, accion, isRejection = false, isChoice = false, buttonLabel = "liberar") {
    setConfirmData({
      isOpen: true,
      title: title,
      msg: mensaje,
      type: isRejection ? "danger" : "info",
      isRejection: isRejection,
      isChoice: isChoice,
      showComment: isRejection, // Reclamo si es rechazo, opcional si es elección
      errorMessage: "",
      action: accion,
      buttonLabel: buttonLabel
    });
  }

  function cerrarConfirmacion() {
    setConfirmData({
      isOpen: false, msg: "", title: "", action: null,
      isRejection: false, isChoice: false, showComment: false, errorMessage: "",
      numeroAnalisis: "", responsableManual: ""
    });
    setComentario("");
    setClaveInput("");
  }

  async function ejecutarConfirmacion() {
    const currentComment = commentRef.current;
    if (confirmData.isRejection && !currentComment.trim()) {
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
      await confirmData.action(currentComment, confirmData.numeroAnalisis, confirmData.responsableManual);
    }
    cerrarConfirmacion();
  }

  /* ===========================================================
     CARGAR ÁREA DE MICROBIOLOGÍA
  =========================================================== */
  useEffect(() => {
    async function loadArea() {
      const { data } = await supabase.from("areas").select("*");
      const areaMB = (data || []).find(x => (x.nombre || "").toLowerCase().includes("micro"));
      setAreaMicroId(areaMB?.id || null);

      // Cargar responsables MB
      const { data: resp } = await supabase
        .from("responsables_liberacion")
        .select("*")
        .eq("area", "microbiologia")
        .eq("activo", true);
      setResponsables(resp || []);
    }
    loadArea();
  }, []);

  /* ===========================================================
     FILTROS (Memo)
  =========================================================== */
  const solicitudesFiltradas = useMemo(() => {
    const q = filtroTexto.trim().toLowerCase();
    if (!q) return solicitudesIniciales;
    return solicitudesIniciales.filter(s =>
      toLowerSafe(s.tipos_solicitud?.nombre).includes(q) ||
      toLowerSafe(s.consecutivo).includes(q) ||
      toLowerSafe(s.id).includes(q)
    );
  }, [solicitudesIniciales, filtroTexto]);

  const etapasFiltradas = useMemo(() => {
    const q = filtroTexto.trim().toLowerCase();
    if (!q) return etapas;
    return etapas.filter(e =>
      e.nombre.toLowerCase().includes(q) ||
      (e.pedidos_produccion?.productos?.articulo || "").toLowerCase().includes(q) ||
      (e.pedidos_produccion?.clientes?.nombre || "").toLowerCase().includes(q) ||
      String(e.pedido_id).includes(q)
    );
  }, [etapas, filtroTexto]);

  /* ===========================================================
     CARGAR PENDIENTES (ETAPAS + SOLICITUDES)
  =========================================================== */
  async function loadTodo() {
    if (loading) return;
    setLoading(true);
    await Promise.all([
      loadEtapasIntermedias(),
      loadSolicitudesIniciales(),
      loadHistorialGlobal()
    ]);
    setLoading(false);
  }

  // 1. Etapas Intermedias (FIX BUG: solo en_revision)
  async function loadEtapasIntermedias() {
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
      .eq("requiere_liberacion", true)
      .ilike("rol_liberador", "%microbiologia%")
      .eq("estado", "en_revision") // SOLO EN REVISIÓN
      .order("pedido_id", { ascending: false });

    if (error) console.error("❌ Error etapas MB:", error);
    else setEtapas(data || []);
  }

  // 2. Solicitudes Iniciales (tabla solicitudes)
  async function loadSolicitudesIniciales() {
    if (!areaMicroId) return;
    const { data, error } = await supabase
      .from("solicitudes")
      .select(`
        *,
        tipos_solicitud ( nombre ),
        prioridades ( nombre )
      `)
      .eq("area_id", areaMicroId)
      .eq("estado_id", 1) // Pendiente
      .order("id", { ascending: false });

    if (error) console.error("❌ Error solicitudes MB:", error);
    else setSolicitudesIniciales(data || []);
  }

  useEffect(() => {
    if (areaMicroId) loadTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaMicroId]);

  /* ===========================================================
     SELECCIONAR ITEM
  =========================================================== */
  async function seleccionarItem(item, tipo) {
    // tipo: 'etapa' | 'solicitud'
    if (tipo === 'solicitud') {
      // Intentar traer datos del pedido para mayor detalle
      const { data: pedido } = await supabase
        .from("pedidos_produccion")
        .select(`
          *,
          productos ( articulo, forma_farmaceutica ),
          clientes ( nombre )
        `)
        .eq("id", item.consecutivo)
        .single();

      setSelected({ ...item, tipoItem: tipo, pedidoVinculado: pedido });
    } else {
      setSelected({ ...item, tipoItem: tipo });
    }

    const pid = tipo === 'etapa' ? item.pedido_id : item.consecutivo;
    if (pid) loadHistorial(pid);
    setComentario("");
  }

  // ==========================
  // Cargar historial (liberaciones) del pedido seleccionado
  // ==========================
  async function loadHistorial(pedidoId) {
    if (!pedidoId) return;
    setHistLoading(true);

    // 1) Traer todas las etapas del pedido
    const { data: etapas, error: errE } = await supabase
      .from("pedido_etapas")
      .select("id, orden, nombre, rol_liberador, requiere_liberacion, estado, fecha_inicio, fecha_fin")
      .eq("pedido_id", pedidoId)
      .order("orden", { ascending: true });

    if (errE) {
      console.error("❌ [Microbiologia][loadHistorial] etapas:", errE);
      setHistLoading(false);
      setHistorial([]);
      return;
    }

    const etapaIds = (etapas || []).map((e) => e.id);
    let libs = [];

    if (etapaIds.length) {
      const { data: l, error: errL } = await supabase
        .from("pedido_etapas_liberaciones")
        .select("*")
        .in("pedido_etapa_id", etapaIds)
        .order("created_at", { ascending: false });

      if (errL) {
        console.error("❌ [Microbiologia][loadHistorial] liberaciones:", errL);
      } else {
        libs = l || [];
      }
    }

    // 2) Unir info
    const libsByEtapa = new Map();
    libs.forEach((x) => {
      const arr = libsByEtapa.get(x.pedido_etapa_id) || [];
      arr.push(x);
      libsByEtapa.set(x.pedido_etapa_id, arr);
    });

    const merged = (etapas || []).map((e) => ({
      ...e,
      liberaciones: libsByEtapa.get(e.id) || [],
    }));

    setHistorial(merged);
    setHistLoading(false);
  }

  // ==========================
  // CARGAR HISTORIAL GLOBAL (Liberaciones Recientes)
  // ==========================
  async function loadHistorialGlobal() {
    // 1) Liberaciones de etapas hechas por Microbiología
    const { data: dataEtapas, error: errEtapas } = await supabase
      .from("pedido_etapas_liberaciones")
      .select(`
        id,
        created_at,
        comentario,
        pedido_etapa_id,
        pedido_etapas (
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
      .eq("rol", "microbiologia")
      .eq("liberada", true)
      .order("created_at", { ascending: false })
      .limit(10);

    // 2) Solicitudes de liberación completadas (estado_id = 2)
    const { data: dataSolicitudes, error: errSols } = await supabase
      .from("solicitudes")
      .select(`
        id,
        consecutivo,
        tipos_solicitud ( nombre ),
        accion_realizada,
        created_at,
        area_solicitante
      `)
      .eq("area_id", areaMicroId)
      .eq("estado_id", 2)
      .order("created_at", { ascending: false })
      .limit(10);

    if (errEtapas || errSols) {
      console.error("❌ Error historial global MB:", errEtapas || errSols);
      return;
    }

    // 3) Traer datos de pedidos para las solicitudes (ya que no hay FK directa para join)
    const pedidoIds = (dataSolicitudes || []).map(s => s.consecutivo).filter(Boolean);
    const mappingPedidos = {};
    if (pedidoIds.length > 0) {
      const { data: dataP } = await supabase
        .from("pedidos_produccion")
        .select("id, op, lote, productos(articulo)")
        .in("id", pedidoIds);
      (dataP || []).forEach(p => {
        mappingPedidos[p.id] = p;
      });
    }

    // Normalizar
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

    const hSols = (dataSolicitudes || []).map(s => {
      const p = mappingPedidos[s.consecutivo];
      return {
        id: `sol-${s.id}`,
        tipo: 'Liberación Inicial',
        pedidoId: s.consecutivo,
        articulo: p?.productos?.articulo || "-",
        cliente: s.area_solicitante,
        op: p?.op || '-',
        lote: p?.lote || '-',
        detalle: s.tipos_solicitud?.nombre || 'Análisis MB',
        fecha: s.created_at
      };
    });

    const merged = [...hEtapas, ...hSols].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    setHistorialGlobal(merged.slice(0, 15));
  }



  // ==========================
  // Acciones: Liberar / Rechazar
  // ==========================
  async function liberarEtapa() {
    if (!selected || selected.tipoItem !== 'etapa') return;

    pedirConfirmacion(
      "✅ Completar paso",
      `¿Deseas dejar una observación antes de completar el paso "${selected.nombre}"?`,
      async (currentComment, nAnalisis, respManual) => {
        setAccionLoading(true);

        const updateData = {
          liberada: true,
          usuario_id: usuarioActual?.id || null, // UUID
          comentario: currentComment || "Liberado por Microbiología.",
        };
        // Opcional
        if (nAnalisis) updateData.numero_analisis = nAnalisis;
        if (respManual) updateData.responsable_manual = respManual;

        // 1) Marcar liberación en tabla liberaciones
        const { error: errLib } = await supabase
          .from("pedido_etapas_liberaciones")
          .update(updateData)
          .eq("pedido_etapa_id", selected.id)
          .eq("rol", "microbiologia");

        if (errLib) {
          console.error("❌ Error al liberar etapa (MB):", errLib);
          alert(`Error al liberar (Micro): ${errLib.message}`);
          setAccionLoading(false);
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
          const { error: errEt } = await supabase
            .from("pedido_etapas")
            .update({ estado: "completada", fecha_fin: ahoraISO() })
            .eq("id", selected.id);

          if (errEt) {
            alert("Error completando etapa.");
            setAccionLoading(false);
            return;
          }
        }

        // 2.5) Guardar en historial oficial (observaciones_pedido) si hay comentario
        if (currentComment && currentComment.trim()) {
          await supabase.from("observaciones_pedido").insert({
            pedido_id: selected.pedido_id,
            usuario: usuarioActual?.usuario || "Microbiología",
            observacion: `✅ ETAPA LIBERADA (${selected.nombre}): ${currentComment}`,
          });
        }

        // 3) Notificar a Producción
        await notifyRoles(
          ["produccion"],
          "Etapa Liberada (MB)",
          `Microbiología ha liberado la etapa "${selected.nombre}" del pedido #${selected.pedido_id}.`,
          selected.pedido_id,
          "proceso_completado"
        );

        // 4) Verificar si todo el flujo terminó
        await checkAndNotifyFlowCompletion(selected.pedido_id);

        setAccionLoading(false);
        setComentario("");
        setSelected(null);
        await loadTodo();
      },
      false, // isRejection
      true,   // isChoice
      "completar"
    );
  }

  async function rechazarEtapa() {
    if (!selected || selected.tipoItem !== 'etapa') return;

    pedirConfirmacion(
      "↩ Rechazar Etapa",
      `Indica el motivo por el cual estás devolviendo la etapa "${selected.nombre}". Este comentario se guardará en el historial de observaciones del pedido.`,
      async (currentComment) => {
        setAccionLoading(true);

        // 1) Guardar en liberaciones
        const { error: errLib } = await supabase
          .from("pedido_etapas_liberaciones")
          .update({
            liberada: false,
            usuario_id: usuarioActual?.id || null, // UUID
            comentario: currentComment,
          })
          .eq("pedido_etapa_id", selected.id)
          .eq("rol", "microbiologia");

        if (errLib) {
          console.error("❌ Error al rechazar etapa (liberaciones):", errLib);
          alert(`Error al rechazar: ${errLib.message}`);
          setAccionLoading(false);
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
          setAccionLoading(false);
          return;
        }

        // 3) Guardar observación oficial del pedido
        await supabase.from("observaciones_pedido").insert({
          pedido_id: selected.pedido_id,
          usuario: usuarioActual?.usuario || "Microbiología",
          observacion: `❌ ETAPA RECHAZADA (${selected.nombre}): ${currentComment}`,
        });

        // 4) Notificar a Producción
        await notifyRoles(
          ["produccion"],
          "Etapa Rechazada (MB)",
          `Microbiología ha RECHAZADO la etapa "${selected.nombre}" del pedido #${selected.pedido_id}. Motivo: ${currentComment.substring(0, 50)}...`,
          selected.pedido_id,
          "urgente"
        );

        setAccionLoading(false);
        setComentario("");
        setSelected(null);
        await loadTodo();
      },
      true // es Rechazo
    );
  }

  async function liberarSolicitud() {
    if (!selected || selected.tipoItem !== 'solicitud') return;

    pedirConfirmacion(
      "🚚 Liberación Inicial",
      "¿Deseas dejar alguna observación sobre el análisis inicial?",
      async (currentComment, nAnalisis, respManual) => {
        setAccionLoading(true);

        const updateData = {
          estado_id: 2,
          accion_realizada: currentComment || "Análisis microbiológico inicial aprobado."
        };

        if (nAnalisis) updateData.numero_analisis = nAnalisis;
        if (respManual) updateData.responsable_manual = respManual;

        const { error } = await supabase
          .from("solicitudes")
          .update(updateData)
          .eq("id", selected.id);

        if (error) {
          alert("Error liberando solicitud.");
          setAccionLoading(false);
          return;
        }

        // Guardar en historial oficial si hay comentario y consecutivo (pedido)
        if (currentComment && currentComment.trim() && selected.consecutivo) {
          await supabase.from("observaciones_pedido").insert({
            pedido_id: selected.consecutivo,
            usuario: usuarioActual?.usuario || "Microbiología",
            observacion: `✅ LIBERACIÓN INICIAL MB: ${currentComment}`,
          });
        }

        if (selected.consecutivo) {
          // ACTUALIZAR FECHA SALIDA MB EN PEDIDO
          await supabase
            .from("pedidos_produccion")
            .update({ fecha_salida_mb: ahoraISO() })
            .eq("id", selected.consecutivo);

          await notifyRoles(
            ["produccion", "controlcalidad"],
            "Liberación MB Inicial",
            `Microbiología ha liberado la solicitud inicial #${selected.id} (Pedido #${selected.consecutivo}).`,
            selected.consecutivo,
            "proceso_completado"
          );
        }

        setAccionLoading(false);
        setComentario("");
        setSelected(null);
        await loadTodo();
      },
      false, // isRejection
      true   // isChoice
    );
  }



  return (
    <>
      <Navbar />

      <div className="mb-wrapper">
        {/* LISTA IZQUIERDA */}
        <div className="mb-list">
          <h3>📥 Pendientes</h3>
          <div className="mb-filters">
            <input
              type="text"
              placeholder="Buscar por lote o producto..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
            />
          </div>

          <SidebarSection
            title="Solicitudes de Liberación"
            count={solicitudesFiltradas.length}
            isOpen={expanded.iniciales}
            onToggle={() => toggleSection("iniciales")}
          >
            {solicitudesFiltradas.map((s) => (
              <div
                key={s.id}
                className={`mb-item ${selected?.id === s.id && selected?.tipoItem === 'solicitud' ? 'mb-item-selected' : ''}`}
                onClick={() => seleccionarItem(s, 'solicitud')}
                style={{ borderLeft: '4px solid #f59e0b' }}
              >
                <div className="mb-item-top">
                  <span className="mb-id">ID: {s.consecutivo ? `MB-${s.consecutivo}` : `#${s.id}`}</span>
                  <span className="mb-chip mb-chip-warn">PENDIENTE MB</span>
                </div>
                <p className="mb-title">{s.tipos_solicitud?.nombre}</p>
                <p className="mb-sub">Originado por: {s.area_solicitante}</p>
              </div>
            ))}
          </SidebarSection>

          <SidebarSection
            title="Etapas Intermedias"
            count={etapasFiltradas.length}
            isOpen={expanded.intermedias}
            onToggle={() => toggleSection("intermedias")}
          >
            {etapasFiltradas.map((e) => (
              <div
                key={e.id}
                className={`mb-item ${selected?.id === e.id && selected?.tipoItem === 'etapa' ? 'mb-item-selected' : ''}`}
                onClick={() => seleccionarItem(e, 'etapa')}
              >
                <div className="mb-item-top">
                  <span className="mb-id">ID PED: #{e.id} | PEDIDO: #{e.pedido_id}</span>
                  <span className="mb-chip">EN REVISIÓN</span>
                </div>
                <p className="mb-title">{e.pedidos_produccion?.productos?.articulo || 'Sin Producto'}</p>
                <p className="mb-sub">
                  <strong>Etapa:</strong> {e.nombre}
                </p>
              </div>
            ))}
          </SidebarSection>
        </div>

        {/* DETALLE DERECHA */}
        <div className="mb-detail">
          {!selected ? (
            <div className="mb-card">
              <p>Selecciona un elemento para ver detalles y liberar.</p>
            </div>
          ) : (
            <>
              {/* VISTA DETALLE PARA ETAPA */}
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
                    <h3>✅ Liberación Microbiológica</h3>
                    <label>Comentario (opcional para liberar / obligatorio para rechazar)</label>
                    <textarea
                      rows="3"
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      placeholder="Ej: Análisis microbiológico conforme..."
                    />

                    <div className="mb-actions-row" style={{ marginTop: 15 }}>
                      <button className="mb-btn mb-btn-danger" onClick={rechazarEtapa} disabled={accionLoading}>
                        {accionLoading ? "Procesando…" : "Rechazar etapa"}
                      </button>
                      <button className="mb-btn" onClick={liberarEtapa} disabled={accionLoading}>
                        {accionLoading ? "Procesando…" : "Completar paso"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* VISTA DETALLE PARA SOLICITUD INICIAL */
                <>
                  <div className="mb-card" style={{ borderTop: "4px solid #f59e0b" }}>
                    <h3>🚚 Solicitud de Liberación</h3>
                    <div className="mb-grid">
                      <p><strong>Solicitud:</strong> {selected.consecutivo ? `MB-${selected.consecutivo}` : `#${selected.id}`}</p>
                      <p><strong>Tipo:</strong> {selected.tipos_solicitud?.nombre}</p>
                      <p><strong>Prioridad:</strong> {selected.prioridades?.nombre}</p>
                      <p><strong>Originado por:</strong> {selected.area_solicitante}</p>

                      {/* Detalles del pedido vinculado */}
                      {selected.pedidoVinculado && (
                        <>
                          <p><strong>Producto:</strong> {selected.pedidoVinculado.productos?.articulo}</p>
                          <p><strong>Forma Farm.:</strong> {selected.pedidoVinculado.productos?.forma_farmaceutica || "-"}</p>
                          <p><strong>Cliente:</strong> {selected.pedidoVinculado.clientes?.nombre}</p>
                          <p><strong>Cantidad:</strong> {selected.pedidoVinculado.cantidad}</p>
                          <p><strong>OP:</strong> {selected.pedidoVinculado.op || "-"}</p>
                          <p><strong>Lote:</strong> {selected.pedidoVinculado.lote || "-"}</p>
                          <p><strong>Vence:</strong> {selected.pedidoVinculado.fecha_vencimiento || "-"}</p>
                        </>
                      )}
                    </div>
                    <div style={{ marginTop: 15, padding: 10, background: '#fffbeb', borderRadius: 6, fontSize: 13, border: '1px solid #fef3c7' }}>
                      <strong>Descripción:</strong>
                      <p style={{ margin: '5px 0 0' }}>{selected.descripcion}</p>
                    </div>
                  </div>

                  <div className="mb-card">
                    <h3>✅ Atender Solicitud</h3>
                    <p style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>
                      Registra el resultado del análisis inicial para liberar el pedido a producción/acondicionamiento.
                    </p>
                    <label>Acción / Comentario realizado</label>
                    <textarea
                      rows="3"
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      placeholder="Ej: Muestra analizada sin hallazgos, se autoriza liberación inicial..."
                    />
                    <button className="mb-btn" style={{ width: '100%', marginTop: 15, background: '#f59e0b' }} onClick={liberarSolicitud} disabled={accionLoading}>
                      {accionLoading ? "Procesando…" : "Confirmar y Liberar Solicitud"}
                    </button>
                  </div>
                </>
              )}

              {/* Historial (Común para ambos si hay pedido) */}
              <div className="mb-card">
                <h3>📚 Historial del Pedido</h3>
                {histLoading && <p>Cargando historial…</p>}
                {!histLoading && historial.length === 0 && (
                  <p style={{ color: "#64748b" }}>Selecciona un ítem con pedido vinculado para ver historial.</p>
                )}
                {!histLoading && historial.length > 0 && (
                  <div className="mb-hist">
                    {historial.map((e) => (
                      <div key={e.id} className="mb-hist-item">
                        <div className="mb-hist-top">
                          <span className="mb-hist-orden">#{e.orden}</span>
                          <span className="mb-hist-nombre">{e.nombre}</span>
                          <span className="mb-chip" style={{ marginLeft: 10 }}>{e.estado}</span>
                        </div>
                        <div className="mb-hist-fechas">
                          <small>
                            Inicio: {e.fecha_inicio ? new Date(e.fecha_inicio).toLocaleString("es-CO") : "-"} |
                            Fin: {e.fecha_fin ? new Date(e.fecha_fin).toLocaleString("es-CO") : "-"}
                          </small>
                        </div>
                        {(e.liberaciones || []).length > 0 && (
                          <div className="mb-hist-libs">
                            {e.liberaciones.map((l) => (
                              <div key={l.id} className="mb-lib">
                                <small>
                                  <strong>{l.rol}</strong> → {l.liberada ? "Liberada" : "No liberada"}{" "}
                                  {l.comentario ? ` — ${l.comentario}` : ""}
                                </small>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* LIBERACIONES RECIENTES MB */}
      <div className="gc-history">
        <h2>📜 Liberaciones Recientes Microbiología</h2>

        <div className="mb-filters" style={{ marginBottom: 15 }}>
          <input
            className="mb-search"
            placeholder="Buscar en historial (Pedido, Producto, Etapa)..."
            value={busquedaGlobal}
            onChange={(e) => setBusquedaGlobal(e.target.value)}
          />
        </div>

        {historialGlobal.length === 0 ? (
          <p className="gc-empty">No hay liberaciones registradas.</p>
        ) : (
          <table className="gc-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Tipo</th>
                <th>Producto</th>
                <th>OP / Lote</th>
                <th>Detalle / Etapa</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {historialGlobal
                .filter(h =>
                  String(h.pedidoId).includes(busquedaGlobal) ||
                  String(h.articulo).toLowerCase().includes(busquedaGlobal.toLowerCase()) ||
                  String(h.detalle).toLowerCase().includes(busquedaGlobal.toLowerCase())
                )
                .slice(0, 10).map((h) => (
                  <tr key={h.id}>
                    <td><strong>#{h.pedidoId}</strong></td>
                    <td><span className="mb-chip">{h.tipo}</span></td>
                    <td>{h.articulo}</td>
                    <td>{h.op} / {h.lote}</td>
                    <td>{h.detalle}</td>
                    <td>{new Date(h.fecha).toLocaleDateString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      <Footer />

      {/* MODAL DE CONFIRMACIÓN / RECHAZO */}
      {confirmData.isOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>
              {confirmData.title || (confirmData.isRejection ? "↩ Rechazar" : "✅ Confirmar")}
            </h3>
            <p style={{ marginTop: 10, color: "#475569", fontSize: 14 }}>
              {confirmData.msg}
            </p>

            {confirmData.isChoice && !confirmData.showComment && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 15 }}>

                {/* CAMPOS ADICIONALES PARA LIBERACIÓN (SOLO SI ES LIBERACIÓN y NO RECHAZO) */}
                {!confirmData.isRejection && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'block', marginBottom: 5, fontWeight: 500 }}>Número de Análisis</label>
                    <input
                      type="text"
                      className="mb-input"
                      placeholder="Ej: MB-12345"
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
                  No, {confirmData.buttonLabel === "completar" ? "completar paso" : "liberar directo"} ⚡
                </button>
              </div>
            )}

            {confirmData.showComment && (
              <>
                {!confirmData.isRejection && (
                  <div style={{ marginBottom: 15 }}>
                    <label style={{ display: 'block', marginBottom: 5, fontWeight: 500 }}>Número de Análisis</label>
                    <input
                      type="text"
                      className="mb-input"
                      placeholder="Ej: MB-12345"
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
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
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
              <button className="mb-btn" style={{ background: "#e2e8f0", color: "#475569" }} onClick={cerrarConfirmacion}>
                Cancelar
              </button>
              {(!confirmData.isChoice || confirmData.showComment) && (
                <button
                  className="mb-btn"
                  style={{ background: confirmData.type === 'danger' ? "#ef4444" : "#2563eb" }}
                  onClick={ejecutarConfirmacion}
                  disabled={accionLoading}
                >
                  {accionLoading ? "Procesando..." : "Confirmar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
