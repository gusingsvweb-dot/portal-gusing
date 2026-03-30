// src/pages/Microbiologia.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, st, ss } from "../api/supabaseClient";
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
  const [searchParams] = useSearchParams();
  const { usuarioActual } = useAuth(); // { usuario, rol, areadetrabajo, ... }
  const rolUsuario = usuarioActual?.rol || "microbiologia";

  // Listas izquierda (divididas como en CC)
  const [etapas, setEtapas] = useState([]); // Etapas intermedias (pedido_etapas)
  const [solicitudesIniciales, setSolicitudesIniciales] = useState([]); // Solicitud inicial (tabla solicitudes)
  const [loading, setLoading] = useState(false);

  // Selección
  const [selected, setSelected] = useState(null); // { item, tipoItem: 'etapa' | 'solicitud' }

  // Accordion Sidebar
  // Accordion Sidebar (Start collapsed)
  const [expanded, setExpanded] = useState({
    liberacionArea: false, // Nueva sección
    iniciales: false,
    enAnalisis: false,
    intermedias: false
  });

  const toggleSection = (sec) => {
    setExpanded(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  // Helper para identificar si es "Liberación de Área" (Ampollas/Viales)
  function isAreaRelease(req) {
    const tipo = toLowerSafe(req.tipos_solicitud?.nombre);
    const desc = toLowerSafe(req.descripcion);
    
    if (tipo.includes("esterilizaci") || desc.includes("esterilizaci")) return false; // Las de esterilización van a Pendientes de Inicio

    const forma = req.pedidoData?.productos?.forma_farmaceutica || "";
    // Regex para detectar Ampolla o Vial (case insensitive)
    return /ampolla|vial/i.test(forma);
  }

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


  // OBSERVACIONES
  const [obs, setObs] = useState([]);
  const [newObs, setNewObs] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  function notifySuccess(msg) {
    setSuccessMsg(msg);
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setSuccessMsg("");
    }, 5000);
  }

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
    });
  }

  function formatFechaFull(f, soloHora = false) {
    if (!f) return "—";
    const d = (f.length === 10) ? new Date(f + "T00:00:00") : new Date(f);
    if (soloHora) {
      if (f.length === 10) return "—";
      return d.toLocaleTimeString("es-CO", { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleString("es-CO");
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
    async function init() {
      // 1. Cargar área
      const { data: areasData } = await supabase.from(st("areas")).select(ss("*"));
      const areaMB = (areasData || []).find(x => (x.nombre || "").toLowerCase().includes("micro"));
      setAreaMicroId(areaMB?.id || null);

      // 2. Cargar responsables MB
      const { data: resp } = await supabase
        .from(st("responsables_liberacion"))
        .select(ss("*"))
        .eq("area", "microbiologia")
        .eq("activo", true);
      setResponsables(resp || []);
    }
    init();
  }, []);

  // Seleccionar automáticamente si viene un ?id= en la URL
  useEffect(() => {
    if (solicitudesIniciales.length === 0 && etapas.length === 0) return;
    const idParam = searchParams.get("id");
    if (!idParam) return;
    const targetId = Number(idParam);

    // 1. Buscar en Etapas
    const e = etapas.find(it => it.pedido_id === targetId);
    if (e) {
      seleccionarItem(e, 'etapa');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    // 2. Buscar en Solicitudes Iniciales (por consecutivo/pedido o id directo)
    const s = solicitudesIniciales.find(it => it.consecutivo === targetId || it.id === targetId);
    if (s) {
      seleccionarItem(s, 'solicitud');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [solicitudesIniciales, etapas, searchParams]);

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
      .from(st("pedido_etapas"))
      .select(ss(`
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
      `))
      .eq("requiere_liberacion", true)
      .eq("requiere_liberacion", true)
      .ilike("rol_liberador", "%microbiologia%")
      .in("estado", ["en_revision", "pendiente_liberacion"]) // REVISIÓN O PENDIENTE LIBERACIÓN
      .order("pedido_id", { ascending: false });

    if (error) console.error("❌ Error etapas MB:", error);
    else setEtapas(data || []);
  }

  // 2. Solicitudes Iniciales (tabla solicitudes)
  async function loadSolicitudesIniciales() {
    if (!areaMicroId) return;
    const { data, error } = await supabase
      .from(st("solicitudes"))
      .select(ss(`
        *,
        tipos_solicitud ( nombre ),
        prioridades ( nombre )
      `))
      .eq("area_id", areaMicroId)
      .eq("estado_id", 1) // Pendiente
      .order("id", { ascending: false });

    if (error) {
      console.error("❌ Error solicitudes MB:", error);
      return;
    }

    const solis = data || [];

    // Enriquecer con pedidos_produccion para saber fecha_inicio_analisis_mb
    // (Asumiendo consecutivo = pedido_id para tipo microbiologia prod)
    if (solis.length > 0) {
      const ids = solis.map(s => s.consecutivo).filter(Boolean);
      if (ids.length > 0) {
        const { data: pedidos } = await supabase
          .from(st("pedidos_produccion"))
          .select(ss("id, fecha_inicio_analisis_mb, productos(articulo, forma_farmaceutica)"))
          .in("id", ids);

        const mapPedidos = {};
        pedidos?.forEach(p => { mapPedidos[p.id] = p; });

        // Adjuntar info al objeto solicitud
        solis.forEach(s => {
          if (s.consecutivo && mapPedidos[s.consecutivo]) {
            s.pedidoData = mapPedidos[s.consecutivo];
          }
        });
      }
    }

    setSolicitudesIniciales(solis);
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
        .from(st("pedidos_produccion"))
        .select(ss(`
          *,
          productos ( articulo, forma_farmaceutica ),
          clientes ( nombre )
        `))
        .eq("id", item.consecutivo)
        .single();

      setSelected({ ...item, tipoItem: tipo, pedidoVinculado: pedido });
    } else {
      setSelected({ ...item, tipoItem: tipo });
    }

    const pid = tipo === 'etapa' ? item.pedido_id : item.consecutivo;
    if (pid) {
      loadHistorial(pid);
      cargarObservaciones(pid);
    } else {
      setObs([]);
    }
    setComentario("");
  }

  // ==========================
  // CARGAR OBSERVACIONES
  // ==========================
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
    if (!newObs.trim()) return;
    const pid = selected.tipoItem === 'etapa' ? selected.pedido_id : selected.consecutivo;
    if (!pid) return alert("No se puede agregar observación sin pedido vinculado.");

    const { error } = await supabase.from(st("observaciones_pedido")).insert([{
      pedido_id: pid,
      usuario: usuarioActual?.usuario || "Microbiología",
      observacion: newObs,
    }]);

    if (error) {
      console.error("❌ Error addObs:", error);
      alert("Error al guardar observación.");
      return;
    }

    setNewObs("");
    cargarObservaciones(pid);
  }

  // ==========================
  // Cargar historial (liberaciones) del pedido seleccionado
  // ==========================
  async function loadHistorial(pedidoId) {
    if (!pedidoId) return;
    setHistLoading(true);

    // 1) Traer todas las etapas del pedido
    const { data: etapas, error: errE } = await supabase
      .from(st("pedido_etapas"))
      .select(ss("id, orden, nombre, rol_liberador, requiere_liberacion, estado, fecha_inicio, fecha_fin"))
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
        .from(st("pedido_etapas_liberaciones"))
        .select(ss("*"))
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
      .from(st("pedido_etapas_liberaciones"))
      .select(ss(`
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
      `))
      .eq("rol", "microbiologia")
      .eq("liberada", true)
      .order("created_at", { ascending: false })
      .limit(10);

    // 2) Solicitudes de liberación completadas (estado_id = 2)
    const { data: dataSolicitudes, error: errSols } = await supabase
      .from(st("solicitudes"))
      .select(ss(`
        id,
        consecutivo,
        tipos_solicitud ( nombre ),
        accion_realizada,
        created_at,
        area_solicitante
      `))
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
        .from(st("pedidos_produccion"))
        .select(ss("id, op, lote, productos(articulo)"))
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
          .from(st("pedido_etapas_liberaciones"))
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
          .from(st("pedido_etapas_liberaciones"))
          .select(ss("liberada"))
          .eq("pedido_etapa_id", selected.id);

        if (errCheck) {
          console.error("❌ Error check todas las libs:", errCheck);
        }

        const todasListas = todasLibs && todasLibs.length > 0 && todasLibs.every(l => l.liberada);

        if (todasListas) {
          // Si estaba en pendiente_liberacion (inicial), pasa a pendiente para que Producción trabaje.
          // Si estaba en en_revision (final), pasa a completada.
          const nuevoEstado = selected.estado === "pendiente_liberacion" ? "pendiente" : "completada";
          const updateObj = { estado: nuevoEstado };
          if (nuevoEstado === "completada") updateObj.fecha_fin = ahoraISO();

          const { error: errEt } = await supabase
            .from(st("pedido_etapas"))
            .update(updateObj)
            .eq("id", selected.id);

          if (errEt) {
            alert("Error completando etapa.");
            setAccionLoading(false);
            return;
          }
        }

        // 2.5) Guardar en historial oficial (observaciones_pedido) si hay comentario
        if (currentComment && currentComment.trim()) {
          await supabase.from(st("observaciones_pedido")).insert({
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
        window.scrollTo({ top: 0, left: 0 }); 
        const nombreEtapa = selected.nombre;
        setSelected(null);
        await loadTodo();
        notifySuccess(`✅ Etapa "${nombreEtapa}" liberada correctamente para Control de Calidad.`);
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
          .from(st("pedido_etapas_liberaciones"))
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
          .from(st("pedido_etapas"))
          .update({ estado: "pendiente" })
          .eq("id", selected.id);

        if (errEtapa) {
          console.error("❌ Error al devolver etapa a pendiente:", errEtapa);
          alert(`Error al devolver a pendiente: ${errEtapa.message}`);
          setAccionLoading(false);
          return;
        }

        // 3) Guardar observación oficial del pedido
        await supabase.from(st("observaciones_pedido")).insert({
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
        window.scrollTo({ top: 0, left: 0 }); // Fix jump BEFORE layout shift
        setSelected(null);
        await loadTodo();
      },
      true // es Rechazo
    );
  }

  async function rechazarSolicitud() {
    if (!selected || selected.tipoItem !== 'solicitud') return;

    pedirConfirmacion(
      "❌ Rechazar Solicitud",
      "Indica el motivo por el cual estás rechazando esta solicitud. Este comentario se guardará en el historial del pedido y notificará a Producción.",
      async (currentComment) => {
        setAccionLoading(true);

        const { error } = await supabase
          .from(st("solicitudes"))
          .update({
            estado_id: 3, // 3 asumimos como Rechazado
            accion_realizada: `Rechazado: ${currentComment}`
          })
          .eq("id", selected.id);

        if (error) {
          alert("Error al rechazar la solicitud.");
          setAccionLoading(false);
          return;
        }

        // Guardar en historial oficial
        if (selected.consecutivo) {
          await supabase.from(st("observaciones_pedido")).insert({
            pedido_id: selected.consecutivo,
            usuario: usuarioActual?.usuario || "Microbiología",
            observacion: `❌ SOLICITUD RECHAZADA (${selected.tipos_solicitud?.nombre || 'General'}): ${currentComment}`,
          });

          // Retrocedemos el pedido a estado 5 (Asignado a Producción) opcional? No, el usuario no dijo que cambiara el estado del pedido a 5. Sólo notificar.
          
          await notifyRoles(
            ["produccion"],
            "Solicitud Rechazada (MB)",
            `Microbiología ha RECHAZADO la solicitud #${selected.id} (Pedido #${selected.consecutivo}). Motivo: ${currentComment.substring(0, 50)}...`,
            selected.consecutivo,
            "urgente"
          );
        }

        setAccionLoading(false);
        setComentario("");
        window.scrollTo({ top: 0, left: 0 }); // Fix jump BEFORE layout shift
        setSelected(null);
        await loadTodo();
      },
      true // isRejection = true (hace que el comentario sea obligatorio)
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
          accion_realizada: currentComment || "Análisis microbiológico aprobado."
        };

        if (nAnalisis) updateData.numero_analisis = nAnalisis;
        if (respManual) updateData.responsable_manual = respManual;

        // 1. Marcar la solicitud como liberada
        const { error: errSol } = await supabase
          .from(st("solicitudes"))
          .update(updateData)
          .eq("id", selected.id);

        if (errSol) {
          alert("Error liberando solicitud: " + errSol.message);
          setAccionLoading(false);
          return;
        }

        // 2. DETECTAR SI ES LOTE
        const desc = selected.descripcion || "";
        const esLote = desc.includes("[LOTE_DESPIROGENIZACION]");
        
        if (esLote) {
          // Extraer IDs usando regex (e.g. #75, #76)
          const matches = desc.match(/#(\d+)/g) || [];
          const idsLote = matches.map(m => parseInt(m.replace("#", ""), 10));

          if (idsLote.length > 0) {
            for (const pid of idsLote) {
              await procesarLiberacionAutomaticaEtapa(pid, currentComment, nAnalisis, respManual);
            }
            alert(`Lote procesado. Se liberaron ${idsLote.length} pedidos.`);
          }
        } else if (selected.consecutivo) {
          // Lógica normal para un solo pedido
          await registrarSalidaMBSimple(selected.consecutivo, currentComment, nAnalisis, respManual);
        }

        setAccionLoading(false);
        setComentario("");
        window.scrollTo({ top: 0, left: 0 });
        setSelected(null);
        await loadTodo();
        notifySuccess("✅ Análisis inicial liberado correctamente para Control de Calidad.");
      },
      false, // isRejection
      true,   // isChoice
      "liberar"
    );
  }

  /* ===========================================================
     HELPERS PARA LIBERACIÓN (Individual y Lote)
  ============================================================ */

  // Registra salida de un pedido simple (solicitud inicial)
  async function registrarSalidaMBSimple(pid, comment, nAnalisis, respManual) {

    
    // Trazabilidad
    const esEsterilizacion = toLowerSafe(selected?.tipos_solicitud?.nombre).includes("esterilizaci") || toLowerSafe(selected?.descripcion).includes("esterilizaci");
    const accionBase = esEsterilizacion ? "✅ TIRILLA APROBADA" : "✅ LIBERACIÓN INICIAL MB";
    const obsTexto = comment ? `${accionBase}: ${comment}` : `${accionBase}`;

    await supabase.from(st("observaciones_pedido")).insert({
      pedido_id: pid,
      usuario: usuarioActual?.usuario || "Microbiología",
      observacion: obsTexto,
    });

    // Actualizar pedido
    await supabase.from(st("pedidos_produccion")).update({ 
      fecha_salida_mb: ahoraISO(),
    }).eq("id", pid);

    // Notificar
    const esDesp = toLowerSafe(selected?.tipos_solicitud?.nombre).includes("despirogeniza") || 
                   toLowerSafe(selected?.tipos_solicitud?.nombre).includes("lavado") ||
                   toLowerSafe(selected?.descripcion).includes("despirogeniza") ||
                   toLowerSafe(selected?.descripcion).includes("lavado");
    
    const rolesANotificar = ["produccion"];
    if (esDesp) rolesANotificar.push("microbiologia", "controlcalidad");

    await notifyRoles(rolesANotificar, "Liberación MB", `Liberado Pedido #${pid}${esDesp ? ' (Despirogenización/Lavado)' : ''}`, pid, "proceso_completado");
  }

  // Busca y libera la etapa de "Despirogenización/Lavado" de un pedido específico
  async function procesarLiberacionAutomaticaEtapa(pid, comment, nAnalisis, respManual) {
    // 1. Buscar la etapa activa que sea Lavado o Despirogenización para este pedido
    const { data: etapas } = await supabase
      .from(st("pedido_etapas"))
      .select("id, nombre")
      .eq("pedido_id", pid)
      .neq("estado", "completada");

    const etapaBatch = (etapas || []).find(e => 
      e.nombre.toLowerCase().includes("lavado") || 
      e.nombre.toLowerCase().includes("despirogeniza")
    );

    if (!etapaBatch) return;

    // 2. Marcar liberación por Micro
    const upLib = {
      liberada: true,
      usuario_id: usuarioActual?.id || null,
      comentario: comment || "Liberado en Lote por Microbiología.",
    };
    if (nAnalisis) upLib.numero_analisis = nAnalisis;
    if (respManual) upLib.responsable_manual = respManual;

    await supabase
      .from(st("pedido_etapas_liberaciones"))
      .update(upLib)
      .eq("pedido_etapa_id", etapaBatch.id)
      .eq("rol", "microbiologia");

    // 3. Verificar si se completa la etapa (si solo micro liberaba)
    const { data: todas } = await supabase
      .from(st("pedido_etapas_liberaciones"))
      .select("liberada")
      .eq("pedido_etapa_id", etapaBatch.id);

    if (todas?.every(l => l.liberada)) {
      await supabase
        .from(st("pedido_etapas"))
        .update({ estado: "completada", fecha_fin: ahoraISO() })
        .eq("id", etapaBatch.id);
    }

    // 4. Trazabilidad y Notificación
    await supabase.from(st("observaciones_pedido")).insert({
      pedido_id: pid,
      usuario: usuarioActual?.usuario || "Microbiología",
      observacion: `✅ LIBERACIÓN EN LOTE (Etapa: ${etapaBatch.nombre}): ${comment || "Sin comentarios"}`,
    });

    await notifyRoles(["produccion", "microbiologia", "controlcalidad"], "Lote Liberado", `Etapa ${etapaBatch.nombre} liberada para #${pid}`, pid, "proceso_completado");
    await checkAndNotifyFlowCompletion(pid);
  }

  // NUEVA FUNCIÓN: INICIAR ANÁLISIS
  async function iniciarAnalisis() {
    if (!selected || selected.tipoItem !== 'solicitud') return;
    const pid = selected.consecutivo;
    if (!pid) return alert("Solicitud sin pedido vinculado.");

    setAccionLoading(true);
    const { error } = await supabase
      .from(st("pedidos_produccion"))
      .update({ fecha_inicio_analisis_mb: ahoraISO() })
      .eq("id", pid);

    if (error) {
      console.error("Error iniciando análisis:", error);
      alert("Error al iniciar análisis.");
    } else {
      // Dejar trazabilidad obligatoria en observaciones
      await supabase.from(st("observaciones_pedido")).insert({
        pedido_id: pid,
        usuario: usuarioActual?.usuario || "Microbiología",
        observacion: `🧪 INICIO DE ANÁLISIS MICROBIOLÓGICO registrado.`,
      });

      // Recargar para que cambie de lista
      await loadTodo();
      window.scrollTo({ top: 0, left: 0 }); // Fix jump BEFORE layout shift
      setSelected(null);
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 100);
    }
    setAccionLoading(false);
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

          {/* 1. LIBERACIÓN DE ÁREA (Ampollas/Viales) */}
          <SidebarSection
            title="Liberación de Área"
            count={solicitudesFiltradas.filter(s => isAreaRelease(s)).length}
            isOpen={expanded.liberacionArea}
            onToggle={() => toggleSection("liberacionArea")}
          >
            {solicitudesFiltradas
              .filter(s => isAreaRelease(s))
              .map((s) => {
                const iniciado = !!s.pedidoData?.fecha_inicio_analisis_mb;
                return (
                  <div
                    key={s.id}
                    className={`mb-item ${selected?.id === s.id && selected?.tipoItem === 'solicitud' ? 'mb-item-selected' : ''}`}
                    onClick={() => seleccionarItem(s, 'solicitud')}
                    style={{ borderLeft: '4px solid #8b5cf6' }} // Morado para diferenciar
                  >
                    <div className="mb-item-top">
                      <span className="mb-id">ID: {s.consecutivo ? `MB-${s.consecutivo}` : `#${s.id}`}</span>
                      <span className={`mb-chip ${iniciado ? '' : 'mb-chip-warn'}`}>
                        {iniciado ? 'EN PROCESO' : 'PENDIENTE'}
                      </span>
                    </div>
                    <p className="mb-title">{s.pedidoData?.productos?.articulo || s.tipos_solicitud?.nombre}</p>
                    <p className="mb-sub">Forma: {s.pedidoData?.productos?.forma_farmaceutica || "N/A"}</p>
                  </div>
                );
              })}
          </SidebarSection>

          <SidebarSection
            title="Pendientes de Inicio"
            count={solicitudesFiltradas.filter(s => !isAreaRelease(s) && !s.pedidoData?.fecha_inicio_analisis_mb).length}
            isOpen={expanded.iniciales}
            onToggle={() => toggleSection("iniciales")}
          >
            {solicitudesFiltradas
              .filter(s => !isAreaRelease(s) && !s.pedidoData?.fecha_inicio_analisis_mb)
              .map((s) => (
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
                  <p className="mb-title">{s.pedidoData?.productos?.articulo || s.tipos_solicitud?.nombre}</p>
                  <p className="mb-sub">Originado por: {s.area_solicitante}</p>
                </div>
              ))}
          </SidebarSection>

          <SidebarSection
            title="En Análisis"
            count={solicitudesFiltradas.filter(s => !isAreaRelease(s) && s.pedidoData?.fecha_inicio_analisis_mb).length}
            isOpen={expanded.enAnalisis}
            onToggle={() => toggleSection("enAnalisis")}
          >
            {solicitudesFiltradas
              .filter(s => !isAreaRelease(s) && s.pedidoData?.fecha_inicio_analisis_mb)
              .map((s) => (
                <div
                  key={s.id}
                  className={`mb-item ${selected?.id === s.id && selected?.tipoItem === 'solicitud' ? 'mb-item-selected' : ''}`}
                  onClick={() => seleccionarItem(s, 'solicitud')}
                  style={{ borderLeft: '4px solid #3b82f6' }}
                >
                  <div className="mb-item-top">
                    <span className="mb-id">ID: {s.consecutivo ? `MB-${s.consecutivo}` : `#${s.id}`}</span>
                    <span className="mb-chip" style={{ background: '#dbeafe', color: '#1e40af' }}>ANALIZANDO</span>
                  </div>
                  <p className="mb-title">{s.pedidoData?.productos?.articulo || s.tipos_solicitud?.nombre}</p>
                  <p className="mb-sub">En proceso desde: {formatFechaFull(s.pedidoData?.fecha_inicio_analisis_mb)}</p>
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
          {showSuccess && (
            <div className="fadeIn" style={{ 
              background: '#ecfdf5', 
              color: '#065f46', 
              padding: '15px', 
              borderRadius: '8px', 
              border: '1px solid #10b981',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontWeight: '500'
            }}>
              <span>✨</span> {successMsg}
            </div>
          )}
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

                    <div className="mb-actions-row">
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
                    <div className="mb-note-box info">
                      <strong>Descripción:</strong>
                      <p style={{ margin: '5px 0 0' }}>{selected.descripcion}</p>
                    </div>
                  </div>

                  <div className="mb-card">
                    {selected.pedidoVinculado && !selected.pedidoVinculado.fecha_inicio_analisis_mb && !isAreaRelease(selected) ? (
                      /* CASO 1: NO INICIADO -> MOSTRAR BOTÓN INICIAR */
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <h3>🧬 Análisis Microbiológico</h3>
                        <p style={{ color: '#64748b', marginBottom: '20px' }}>
                          El pedido está pendiente de análisis. Haz clic abajo para marcar el inicio del proceso.
                        </p>
                        <button
                          className="mb-btn"
                          style={{ background: '#3b82f6', fontSize: '16px', padding: '12px 24px' }}
                          onClick={iniciarAnalisis}
                          disabled={accionLoading}
                        >
                          {accionLoading ? "Iniciando..." : "🧪 Iniciar Análisis MB"}
                        </button>
                      </div>
                    ) : (
                      /* CASO 2: YA INICIADO (O LIBERACIÓN RÁPIDA) -> MOSTRAR FORMULARIO DE LIBERACIÓN */
                      (function() {
                        const esEsteril_tipo = toLowerSafe(selected.tipos_solicitud?.nombre).includes("esterilizaci");
                        const esEsteril_desc = toLowerSafe(selected.descripcion).includes("esterilizaci");
                        const esEsterilizacion = esEsteril_tipo || esEsteril_desc;
                        
                        return (
                          <>
                            <h3>✅ Atender Solicitud</h3>
                            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>
                              Registra el resultado del análisis para liberar o rechazar el pedido.
                            </p>
                            <label>Acción / Comentario realizado</label>
                            <textarea
                              rows="3"
                              value={comentario}
                              onChange={(e) => setComentario(e.target.value)}
                              placeholder="Ej: Muestra analizada sin hallazgos, se autoriza liberación..."
                            />
                            <div className="mb-actions-row" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                              <button className="mb-btn mb-btn-danger" style={{ flex: 1 }} onClick={rechazarSolicitud} disabled={accionLoading}>
                                {accionLoading ? "Procesando…" : "Rechazar (Obligatorio)"}
                              </button>
                              <button className="mb-btn" style={{ flex: 1 }} onClick={liberarSolicitud} disabled={accionLoading}>
                                {accionLoading ? "Procesando…" : (esEsterilizacion ? "✅ Resultado positivo MB (Liberar)" : "Confirmar y Liberar")}
                              </button>
                            </div>
                          </>
                        );
                      })()
                    )}
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

              {/* SECCIÓN DE OBSERVACIONES (Visible para etapa y solicitud vinculada) */}
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
                    placeholder="+ Añadir observación..."
                    value={newObs}
                    onChange={(e) => setNewObs(e.target.value)}
                    style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                  <button className="mb-btn" onClick={addObs} style={{ width: 'auto' }}>➕ Agregar</button>
                </div>
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
                    <td>{formatFechaFull(h.fecha)}</td>
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
