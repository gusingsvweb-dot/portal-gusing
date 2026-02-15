// src/pages/Produccion.jsx
import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import "./Produccion.css";
import CamposDinamicos from "../components/solicitudes/CamposDinamicos";
import { notifyRoles, checkAndNotifyFlowCompletion } from "../api/notifications";

/* ===========================================================
   MAPA DE ESTADOS → SIGUIENTE ESTADO
   (coincide con tabla "estados")
=========================================================== */
const NEXT_STATE = {
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 8, // luego de crear solicitud MB pasa a Acondicionamiento (pero bloquearemos si hay etapas pendientes)
  8: 9,
  9: 10,
  10: 11,
  11: 12,
};

/* ===========================================================
   ESTADO → CAMPO DE FECHA AUTOMÁTICA (producción)
=========================================================== */
function obtenerCampoFechaAuto(estadoId) {
  const campos = {
    5: "fecha_inicio_produccion",
    6: "fecha_entrada_mb",
    8: "fecha_inicio_acondicionamiento",
    9: "fecha_fin_acondicionamiento",
    10: "fecha_liberacion_pt",
    11: "fecha_entrega_bodega",
  };
  return campos[estadoId] || null;
}

const ASIGNACION_ESTADO = {
  5: "produccion",
  6: "produccion",
  8: "acondicionamiento",
  9: "control_calidad",
  10: "produccion",
  11: "bodega",
};

const ESTADO_ETAPA = {
  PENDIENTE: "pendiente",
  PENDIENTE_LIBERACION: "pendiente_liberacion",
  EN_REVISION: "en_revision",
  COMPLETADA: "completada",
};


/* ===========================================================
   UTIL: sumar días hábiles (sin sábados ni domingos)
=========================================================== */
function sumarDiasHabiles(dias) {
  const date = new Date();
  let agregados = 0;

  while (agregados < dias) {
    date.setDate(date.getDate() + 1);
    const dia = date.getDay(); // 0: dom, 6: sáb
    if (dia !== 0 && dia !== 6) agregados++;
  }

  return date.toISOString().slice(0, 10); // yyyy-mm-dd
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function ahoraISO() {
  return new Date().toISOString();
}

/* ===========================================================
   COMPONENTE COLLAPSIBLE
=========================================================== */
function CollapsibleSection({ title, children, isOpen, onToggle }) {
  return (
    <div className="pc-collapsible">
      <div className="pc-collapsible-header" onClick={onToggle}>
        <h4>{title}</h4>
        <span className={`arrow ${isOpen ? "open" : ""}`}>▼</span>
      </div>
      {isOpen && <div className="pc-collapsible-content fadeIn">{children}</div>}
    </div>
  );
}

/* ===========================================================
   COMPONENTE PRINCIPAL
=========================================================== */
export default function Produccion() {
  const { usuarioActual } = useAuth(); // { usuario, rol, areadetrabajo, correo ... }
  const rolUsuario = usuarioActual?.rol || "produccion";
  const esProduccion = rolUsuario === "produccion";

  const [pedidos, setPedidos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [formData, setFormData] = useState({});
  const [obs, setObs] = useState([]);
  const [newObs, setNewObs] = useState("");

  // Filtros UI
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroAsignado, setFiltroAsignado] = useState("todos");

  // Accordion State
  const [expanded, setExpanded] = useState({
    detalle: true,
    etapas: true,
    estado: true,
    obs: false,
    historial: false,
    materias: false,
  });

  const toggleSection = (sec) => {
    setExpanded((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  // ==========================
  // Modal Solicitud MB
  // ==========================
  const [showSolicitudMB, setShowSolicitudMB] = useState(false);

  const [areas, setAreas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [tiposFiltrados, setTiposFiltrados] = useState([]);
  const [prioridades, setPrioridades] = useState([]);
  const [flujos, setFlujos] = useState([]); // CATALOGO DE FLUJOS ACTIVOS

  const [areaMicroId, setAreaMicroId] = useState(null);

  const [solForm, setSolForm] = useState({
    tipo_solicitud_id: "",
    prioridad_id: "",
    descripcion: "",
    justificacion: "",
    formaManual: "", // NUEVO: para cuando el producto no tiene forma
  });

  const [solLoading, setSolLoading] = useState(false);
  const [solMsg, setSolMsg] = useState("");

  // ==========================
  // Modal Selección Materiales (Detailed request)
  // ==========================
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [materialesCatalogo, setMaterialesCatalogo] = useState([]);
  const [materialesSeleccionados, setMaterialesSeleccionados] = useState([{ referencia: "", cantidad: 1 }]);
  const [materialesLoading, setMaterialesLoading] = useState(false);

  // NUEVO: Ver estado de solicitud (readonly para Produccion)
  const [itemsSolicitados, setItemsSolicitados] = useState([]);
  const [showItemsSolicitados, setShowItemsSolicitados] = useState(false);
  const [haSolicitadoMicro, setHaSolicitadoMicro] = useState(false);

  async function checkExistenciaSolicitudMicro(pedidoId) {
    if (!pedidoId || !areaMicroId) return;

    const { data, error } = await supabase
      .from("solicitudes")
      .select("id")
      .eq("consecutivo", pedidoId)
      .eq("area_id", areaMicroId)
      .limit(1);

    if (error) {
      console.error("Error checkExistenciaSolicitudMicro:", error);
      return;
    }

    setHaSolicitadoMicro(data && data.length > 0);
  }

  async function cargarItemsSolicitados(pedidoId) {
    if (!pedidoId) return;

    // 1. Cargar items del pedido (SIN JOIN para evitar error de FK)
    const { data: items, error: errItems } = await supabase
      .from("pedidos_bodega_items")
      .select("*")
      .eq("pedido_id", pedidoId)
      .order("id", { ascending: true });

    if (errItems) {
      console.error("Error cargando items de bodega:", errItems);
      return;
    }

    // 2. Cargar catálogo de materias primas para cruzar nombres
    const { data: catalogo, error: errCat } = await supabase
      .from("MateriasPrimas")
      .select("REFERENCIA, ARTICULO, UNIDAD");

    if (errCat) {
      console.error("Error cargando catálogo de materias primas:", errCat);
      // Aún así intentamos mostrar lo que hay
    }

    const listaItems = items || [];
    const listaCatalogo = catalogo || [];

    // 3. Cruzar datos
    const mapeados = listaItems.map(it => {
      const mat = listaCatalogo.find(c => Number(c.REFERENCIA) === Number(it.referencia_materia_prima));
      return {
        ...it,
        articulo_nombre: mat ? mat.ARTICULO : "Ref: " + it.referencia_materia_prima,
        unidad: mat ? mat.UNIDAD : "-"
      };
    });

    setItemsSolicitados(mapeados);
  }

  // ==========================
  // NUEVO: flujo del pedido (pedido_etapas)
  // ==========================
  const [pedidoEtapas, setPedidoEtapas] = useState([]);
  const [etapasLoading, setEtapasLoading] = useState(false);
  const [etapasDict, setEtapasDict] = useState({}); // { 123: "Lavado", 124: "Despirogenización" }

  // ==========================
  // CONFIRMACIÓN DE ACCIONES
  // ==========================
  const [confirmData, setConfirmData] = useState({
    isOpen: false,
    msg: "",
    action: null, // () => Promise<void>
  });

  // Cancelación
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  function pedirConfirmacion(mensaje, accionAsync) {
    setConfirmData({
      isOpen: true,
      msg: mensaje,
      action: () => accionAsync(), // envolvemos para asegurar
    });
  }

  async function ejecutarConfirmacion() {
    if (!confirmData.action) return;
    // Ejecutar acción
    await confirmData.action();
    // Cerrar
    setConfirmData({ isOpen: false, msg: "", action: null });
  }

  function cancelarConfirmacion() {
    setConfirmData({ isOpen: false, msg: "", action: null });
  }

  const etapasPendientes = useMemo(() => {
    return (pedidoEtapas || []).filter((e) => e.estado !== ESTADO_ETAPA.COMPLETADA);
  }, [pedidoEtapas]);


  const flujoCompleto = useMemo(() => {
    return (pedidoEtapas || []).length > 0 && etapasPendientes.length === 0;
  }, [pedidoEtapas, etapasPendientes]);

  const etapaActual = useMemo(() => {
    if (!pedidoEtapas?.length) return null;
    const pendientes = pedidoEtapas.filter((e) => e.estado !== ESTADO_ETAPA.COMPLETADA);
    pendientes.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    return pendientes[0] || null;
  }, [pedidoEtapas]);


  /* ===========================================================
     CARGAR CATÁLOGOS SOLICITUDES (areas, tipos, prioridades)
  ============================================================ */
  useEffect(() => {
    async function loadSolicitudCatalogos() {
      const { data: a, error: ea } = await supabase.from("areas").select("*");
      const { data: t, error: et } = await supabase.from("tipos_solicitud").select("*");
      const { data: p, error: ep } = await supabase.from("prioridades").select("*");
      const { data: f, error: ef } = await supabase
        .from("flujos_forma")
        .select("*")
        .eq("activo", true);

      if (ea) console.error("Error areas:", ea);
      if (et) console.error("Error tipos_solicitud:", et);
      if (ep) console.error("Error prioridades:", ep);
      if (ef) console.error("Error flujos:", ef);

      setAreas(a || []);
      setTipos(t || []);
      setPrioridades(p || []);
      setFlujos(f || []);

      // Detectar Microbiología por nombre
      const areaMB = (a || []).find((x) =>
        (x.nombre || "").trim().toLowerCase().includes("micro")
      );
      setAreaMicroId(areaMB?.id || null);
    }

    loadSolicitudCatalogos();
    loadMateriales();
  }, []);

  async function loadMateriales() {
    const { data, error } = await supabase.from("MateriasPrimas").select("*").order("ARTICULO", { ascending: true });
    if (error) console.error("Error cargando materias primas:", error);
    else setMaterialesCatalogo(data || []);
  }

  /* ===========================================================
     Filtrar tipos SOLO de Microbiología
  ============================================================ */
  useEffect(() => {
    if (!areaMicroId) {
      setTiposFiltrados([]);
      return;
    }

    const filtrados = tipos.filter(
      (t) => Number(t.id_area_relacionada) === Number(areaMicroId)
    );
    setTiposFiltrados(filtrados);

    setSolForm((prev) => ({ ...prev, tipo_solicitud_id: "" }));
  }, [areaMicroId, tipos]);

  /* ===========================================================
     CARGAR PEDIDOS
  ============================================================ */
  async function loadPedidos() {
    const { data, error } = await supabase
      .from("pedidos_produccion")
      .select(
        `
        *,
        productos (
          articulo,
          nombre_registro_lote,
          presentacion_comercial,
          forma_farmaceutica,
          referencia
        ),
        clientes ( nombre ),
        estados ( nombre )
      `
      )
      .order("id", { ascending: false });

    if (error) {
      console.error("❌ [loadPedidos] Error:", error);
      return;
    }

    setPedidos(data || []);
  }

  useEffect(() => {
    loadPedidos();
  }, []);

  // Cargar etapas activas para pedidos en estado 8 (Etapas internas)
  useEffect(() => {
    if (pedidos.length === 0) return;
    const pedidosEnEtapas = pedidos.filter(p => p.estado_id === 8).map(p => p.id);
    if (pedidosEnEtapas.length === 0) return;

    async function loadEtapasBatch() {
      const { data } = await supabase
        .from("pedido_etapas")
        .select("pedido_id, nombre, estado, orden")
        .in("pedido_id", pedidosEnEtapas)
        .neq("estado", "completada");

      if (!data) return;

      const newDict = {};
      // Agrupar por pedido
      const groups = {};
      data.forEach(d => {
        if (!groups[d.pedido_id]) groups[d.pedido_id] = [];
        groups[d.pedido_id].push(d);
      });

      // Encontrar la activa (menor orden)
      Object.keys(groups).forEach(pid => {
        const list = groups[pid];
        list.sort((a, b) => (a.orden || 0) - (b.orden || 0));
        if (list.length > 0) {
          newDict[pid] = list[0].nombre;
        }
      });

      setEtapasDict(prev => ({ ...prev, ...newDict }));
    }

    loadEtapasBatch();
  }, [pedidos]);

  /* ===========================================================
     CARGAR OBSERVACIONES
  ============================================================ */
  async function cargarObservaciones(pedidoId) {
    const { data, error } = await supabase
      .from("observaciones_pedido")
      .select("*")
      .eq("pedido_id", pedidoId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ [cargarObservaciones] Error:", error);
      return;
    }

    setObs(data || []);
  }

  /* ===========================================================
     NUEVO: cargar etapas del pedido (pedido_etapas)
  ============================================================ */
  async function cargarPedidoEtapas(pedidoId) {
    if (!pedidoId) return;
    setEtapasLoading(true);

    const { data, error } = await supabase
      .from("pedido_etapas")
      .select("*, pedido_etapas_liberaciones(*)")
      .eq("pedido_id", pedidoId)
      .order("orden", { ascending: true });

    setEtapasLoading(false);

    if (error) {
      console.error("❌ [cargarPedidoEtapas] Error:", error);
      setPedidoEtapas([]);
      return;
    }

    setPedidoEtapas(data || []);
    checkExistenciaSolicitudMicro(pedidoId);
  }

  /* ===========================================================
     SELECCIONAR PEDIDO
  ============================================================ */
  function seleccionarPedido(p) {
    setSelected(p);

    // Auto-expand materias if in step 4
    setExpanded(prev => ({ ...prev, materias: (p.estado_id === 4) }));

    if (p.estado_id === 3) {
      setFormData({
        fecha_maxima_entrega: p.fecha_maxima_entrega || sumarDiasHabiles(28),
        fecha_propuesta_entrega: p.fecha_propuesta_entrega || "",
      });
    } else {
      setFormData({});
    }

    cargarObservaciones(p.id);
    cargarObservaciones(p.id);
    cargarPedidoEtapas(p.id);
    checkExistenciaSolicitudMicro(p.id);
    // ... rest
    if (p.fecha_solicitud_materias_primas) {
      cargarItemsSolicitados(p.id);
    } else {
      setItemsSolicitados([]);
    }
  }

  /* ===========================================================
     RECARGAR PEDIDO SELECCIONADO
  ============================================================ */
  async function reloadSelected() {
    if (!selected) return;

    await loadPedidos();

    const { data, error } = await supabase
      .from("pedidos_produccion")
      .select(
        `
        *,
        productos (
          articulo,
          nombre_registro_lote,
          presentacion_comercial,
          forma_farmaceutica,
          referencia
        ),
        clientes ( nombre ),
        estados ( nombre )
      `
      )
      .eq("id", selected.id)
      .single();

    if (error) {
      console.error("❌ [reloadSelected] Error:", error);
      return;
    }

    setSelected(data);
    cargarObservaciones(data.id);
    cargarPedidoEtapas(data.id);
  }

  /* ===========================================================
     SOLICITAR MATERIAS PRIMAS (Producción → Bodega)
  ============================================================ */
  async function solicitarMateriasPrimas(confirmado = false, conItems = false) {
    if (!selected) return;

    // Si es con items y ya tenemos la lista, guardamos
    if (conItems) {
      setMaterialesLoading(true);

      // 1. Guardar items detallados
      const rawInserts = materialesSeleccionados
        .filter(m => m.referencia && m.cantidad > 0)
        .map(m => ({
          pedido_id: selected.id,
          referencia_materia_prima: m.referencia,
          cantidad: m.cantidad,
          es_critico: m.es_critico !== false // Default true
        }));

      if (rawInserts.length > 0) {
        const { error: errItems } = await supabase.from("pedidos_bodega_items").insert(rawInserts);
        if (errItems) {
          console.error("Error guardando items de bodega:", errItems);
          alert("Error al guardar la lista de materiales.");
          setMaterialesLoading(false);
          return;
        }
      }
    }

    if (!confirmado && !conItems) {
      pedirConfirmacion(
        "¿Confirmas que deseas solicitar materias primas a Bodega?",
        () => solicitarMateriasPrimas(true)
      );
      return;
    }

    const { error } = await supabase
      .from("pedidos_produccion")
      .update({
        fecha_solicitud_materias_primas: hoyISO(),
        asignado_a: "bodega",
      })
      .eq("id", selected.id);

    if (error) {
      console.error("❌ [solicitarMateriasPrimas] Error:", error);
      setMaterialesLoading(false);
      return alert("Error solicitando materias primas.");
    }

    // 🔔 NOTIFICAR A BODEGA
    try {
      await notifyRoles(
        ["bodega"],
        "Solicitud de Materias Primas",
        `Producción ha solicitado materias primas para el Pedido #${selected.id} (${selected.productos?.articulo || ""})`,
        selected.id,
        "accion_requerida"
      );
    } catch (errorNotif) {
      console.error("❌ Error notificando a bodega:", errorNotif);
    }

    setMaterialesLoading(false);
    setShowMaterialModal(false);
    await reloadSelected();
  }

  /* ===========================================================
     DEVOLVER A BODEGA (Material Incompleto)
  ============================================================ */
  async function devolverABodega() {
    if (!selected) return;
    const razon = prompt("Por favor, ingresa el motivo de la devolución a Bodega (obligatorio):");
    if (!razon || !razon.trim()) {
      alert("Debes ingresar un motivo para devolver el pedido.");
      return;
    }

    // 1. Agregar observación
    const { error: errObs } = await supabase.from("observaciones_pedido").insert([{
      pedido_id: selected.id,
      usuario: usuarioActual?.usuario || "Producción",
      observacion: `🚫 DEVOLUCIÓN A BODEGA (Material Incompleto): ${razon}`
    }]);

    if (errObs) console.error("Error guardando observación de devolución:", errObs);

    // 2. Cambiar estado y asignación
    const { error } = await supabase
      .from("pedidos_produccion")
      .update({
        estado_id: 4, // Vuelve a Esperando Materia Prima
        asignado_a: "bodega",
        fecha_entrega_de_materias_primas_e_insumos: null // Resetear entrega
      })
      .eq("id", selected.id);

    if (error) {
      console.error("Error devolviendo a bodega:", error);
      alert("Error al procesar la devolución.");
      return;
    }

    // 3. Resetear items para que bodega los vuelva a marcar
    await supabase
      .from("pedidos_bodega_items")
      .update({ completado: false })
      .eq("pedido_id", selected.id);

    // 🔔 NOTIFICAR A BODEGA
    try {
      await notifyRoles(
        ["bodega"],
        "Pedido Devuelto por Producción",
        `Producción ha devuelto el Pedido #${selected.id} por materia prima incompleta. Motivo: ${razon}`,
        selected.id,
        "accion_requerida"
      );
    } catch (errNotif) {
      console.error("Error notificando devolución a bodega:", errNotif);
    }

    alert("Pedido devuelto a Bodega exitosamente.");
    await reloadSelected();
  }

  const handleMaterialChange = (index, field, value) => {
    const updated = [...materialesSeleccionados];
    updated[index][field] = value;
    setMaterialesSeleccionados(updated);
  };

  const addMaterialRow = () => {
    setMaterialesSeleccionados([...materialesSeleccionados, { referencia: "", cantidad: 1 }]);
  };

  const removeMaterialRow = (index) => {
    const updated = materialesSeleccionados.filter((_, i) => i !== index);
    setMaterialesSeleccionados(updated.length ? updated : [{ referencia: "", cantidad: 1 }]);
  };

  /* ===========================================================
     NUEVO: crear pedido_etapas + liberaciones (una sola vez)
     Se llama justo después de crear solicitud MB
  ============================================================ */
  async function crearEtapasParaPedidoSiNoExisten(pedido) {
    if (!pedido?.id) throw new Error("Pedido inválido (sin id).");

    // 0) Si ya existen, no duplicar
    const { data: ya, error: errYa } = await supabase
      .from("pedido_etapas")
      .select("id")
      .eq("pedido_id", pedido.id)
      .limit(1);

    if (errYa) {
      console.error("❌ [crearEtapasParaPedidoSiNoExisten] check exist:", errYa);
      throw errYa;
    }

    if (ya?.length) {
      // ya están creadas
      return { created: false };
    }

    // Si la pasamos manual (en solForm), TIENE PRIORIDAD sobre la del producto (por si la del producto es inválida)
    const formaProd = (pedido.productos?.forma_farmaceutica || "").trim();
    const formaManual = (solForm.formaManual || "").trim();

    const forma = formaManual || formaProd;

    console.log(`🧪 [crearEtapas] Usando forma farmacéutica: "${forma}" (Manual: "${formaManual}", Prod: "${formaProd}")`);

    if (!forma) {
      throw new Error(
        "El producto no tiene forma_farmaceutica y no se seleccionó ninguna manualmente."
      );
    }

    // 2) Buscar flujo activo
    // Nota: Aunque ya tenemos 'flujos' en estado, aquí hacemos la query segura 
    // para obtener el ID exacto y asegurarnos que existe en BD al momento de crear.
    const { data: flujo, error: errFlujo } = await supabase
      .from("flujos_forma")
      .select("id, forma_farmaceutica, activo")
      .ilike("forma_farmaceutica", forma.trim())   // ayuda por mayúsculas
      .eq("activo", true)
      .limit(1)
      .maybeSingle();

    if (errFlujo) {
      console.error("❌ flujo:", errFlujo);
      throw errFlujo;
    }

    if (!flujo?.id) {
      throw new Error(
        `No existe un flujo ACTIVO en flujos_forma para la forma farmacéutica: "${forma}". ` +
        `Crea ese registro en flujos_forma y marca activo=true.`
      );
    }


    if (errFlujo) {
      console.error("❌ [crearEtapasParaPedidoSiNoExisten] flujo:", errFlujo);
      throw errFlujo;
    }

    if (!flujo?.id) {
      throw new Error(`No existe flujo activo para la forma farmacéutica: "${forma}"`);
    }

    // 2) Traer catálogo de etapas del flujo
    const { data: cat, error: errCat } = await supabase
      .from("flujos_forma_etapas")
      .select("flujo_id, orden, nombre, requiere_liberacion, rol_liberador")
      .eq("flujo_id", flujo.id)
      .order("orden", { ascending: true });

    if (errCat) {
      console.error("❌ [crearEtapasParaPedidoSiNoExisten] cat:", errCat);
      throw errCat;
    }

    if (!cat?.length) {
      throw new Error(`El flujo ${flujo.id} no tiene etapas en flujos_forma_etapas.`);
    }

    // 3) Insertar pedido_etapas
    const ahora = ahoraISO();

    const inserts = cat.map((e, index) => {
      const requiere = !!e.requiere_liberacion;
      const esPrimera = index === 0;

      return {
        pedido_id: pedido.id,
        flujo_id: flujo.id,
        orden: e.orden,
        nombre: e.nombre,
        requiere_liberacion: requiere,
        rol_liberador: requiere ? e.rol_liberador : null,

        // ✅ estados válidos SIEMPRE
        estado: esPrimera
          ? (requiere ? ESTADO_ETAPA.PENDIENTE_LIBERACION : ESTADO_ETAPA.PENDIENTE)
          : ESTADO_ETAPA.PENDIENTE,


        // ✅ fecha_inicio solo para la primera (opcional)
        fecha_inicio: esPrimera ? ahora : null,
        fecha_fin: null,
      };
    });



    const { error: errIns } = await supabase.from("pedido_etapas").insert(inserts);
    if (errIns) {
      console.error("❌ [crearEtapasParaPedidoSiNoExisten] insert pedido_etapas:", errIns);
      throw errIns;
    }

    // 4) Crear liberaciones pendientes para las que requieren liberación
    const { data: creadas, error: errCreadas } = await supabase
      .from("pedido_etapas")
      .select("id, rol_liberador, requiere_liberacion")
      .eq("pedido_id", pedido.id)
      .eq("requiere_liberacion", true);

    if (errCreadas) {
      console.error("❌ [crearEtapasParaPedidoSiNoExisten] fetch creadas:", errCreadas);
      throw errCreadas;
    }

    const libInserts = [];
    (creadas || []).forEach((pe) => {
      const roles = (pe.rol_liberador || "").split(",").map(r => r.trim()).filter(Boolean);
      roles.forEach(rol => {
        libInserts.push({
          pedido_etapa_id: pe.id,
          rol: rol,
          liberada: false,
          usuario_id: null,
          comentario: "",
        });
      });
    });


    if (libInserts.length) {
      const { error: errLib } = await supabase
        .from("pedido_etapas_liberaciones")
        .insert(libInserts);

      if (errLib) {
        console.error("❌ [crearEtapasParaPedidoSiNoExisten] insert liberaciones:", errLib);
        throw errLib;
      }
    }

    return { created: true, flujo_id: flujo.id };
  }

  /* ===========================================================
     enviarSolicitudMBYContinuar
     - Inserta solicitud a MB
     - Actualiza pedido (fecha_entrada_mb, estado=8)
     - NUEVO: crea etapas del pedido (una sola vez)
  ============================================================ */
  async function enviarSolicitudMBYContinuar(confirmado = false) {
    if (!selected) return;

    if (!areaMicroId) {
      setSolMsg("⚠️ No se encontró el área de Microbiología en la tabla 'areas'.");
      return;
    }

    if (!solForm.tipo_solicitud_id || !solForm.prioridad_id || !solForm.descripcion) {
      setSolMsg("⚠️ Debes completar todos los campos obligatorios.");
      return;
    }

    // Validar forma farmacéutica (si falta o si NO coincide con un flujo activo)
    const formaProd = (selected.productos?.forma_farmaceutica || "").trim();

    // Verificar si la forma del producto es válida en nuestros flujos activos
    const formaEsValida = formaProd && flujos.some(f =>
      f.forma_farmaceutica.trim().toLowerCase() === formaProd.toLowerCase()
    );

    // Si no es válida (o no existe) y tampoco se seleccionó manual -> Error
    if (!formaEsValida && !solForm.formaManual) {
      setSolMsg(
        formaProd
          ? `⚠️ La forma "${formaProd}" no tiene flujo activo. Selecciona una válida manualmente.`
          : "⚠️ Este producto no tiene forma farmacéutica. Debes seleccionarla manualmente."
      );
      return;
    }

    if (!confirmado) {
      pedirConfirmacion("¿Confirmas enviar esta solicitud a Microbiología?", () => enviarSolicitudMBYContinuar(true));
      return;
    }

    setSolLoading(true);
    setSolMsg("");

    // 1) Crear solicitud
    const { error: errSol } = await supabase.from("solicitudes").insert([
      {
        tipo_solicitud_id: solForm.tipo_solicitud_id,
        prioridad_id: solForm.prioridad_id,
        descripcion: `Pedido #${selected.id} - ${selected.productos?.articulo || ""}\n${solForm.descripcion}`,
        justificacion: solForm.justificacion || "",
        usuario_id: usuarioActual?.usuario, // En tabla solicitudes, usuario_id es el Nickname (string)
        area_solicitante: usuarioActual?.areadetrabajo,
        estado_id: 1, // Pendiente
        area_id: areaMicroId, // SIEMPRE Microbiología
        consecutivo: selected.id, // puente
      },
    ]);

    if (errSol) {
      console.error(errSol);
      setSolLoading(false);
      setSolMsg("❌ Error al enviar la solicitud.");
      return;
    }

    // 2) Actualizar pedido: fecha_entrada_mb y pasar a estado 8
    const { error: errPedido } = await supabase
      .from("pedidos_produccion")
      .update({
        fecha_entrada_mb: hoyISO(),
        estado_id: 8,
        asignado_a: "produccion",
      })
      .eq("id", selected.id);

    if (errPedido) {
      console.error(errPedido);
      setSolLoading(false);
      setSolMsg("⚠️ Solicitud enviada, pero error actualizando el pedido.");
      return;
    }

    // 3) NUEVO: crear etapas (solo una vez por pedido)
    try {
      await crearEtapasParaPedidoSiNoExisten(selected);
    } catch (e) {
      console.error("❌ Error creando etapas:", e);
      setSolLoading(false);
      setSolMsg(
        `⚠️ Solicitud enviada y pedido actualizado, pero falló la creación de etapas: ${e?.message || "Error"
        }`
      );
      // igual recargamos para que no quede la UI desfasada
      await reloadSelected();
      return;
    }

    setSolLoading(false);
    setHaSolicitadoMicro(true);

    // Cerrar modal y reset
    setShowSolicitudMB(false);
    setSolMsg("");
    setSolForm({
      tipo_solicitud_id: "",
      prioridad_id: "",
      descripcion: "",
      justificacion: "",
      formaManual: "",
    });

    await reloadSelected();
  }

  // NUEVO: Avanzar sin solicitud (si no es estéril)
  async function avanzarSinSolicitudMB() {
    if (!selected) return;

    // 1. Validar forma
    const formaProd = (selected.productos?.forma_farmaceutica || "").trim();
    const formaManual = (solForm.formaManual || "").trim();
    const forma = formaManual || formaProd;

    // Verificar si es válida
    const flujo = flujos.find(f => f.forma_farmaceutica.trim().toLowerCase() === forma.toLowerCase());
    if (!flujo) {
      alert("La forma farmacéutica no es válida. Selecciónela manualmente.");
      return;
    }

    // Confirmar
    const confirmado = window.confirm(
      `El producto tiene forma "${forma}".\n\n¿Desea omitir la solicitud a Microbiología y avanzar etapa?`
    );
    if (!confirmado) return;

    setSolLoading(true); // Reusamos loading state

    try {
      // 2. Crear etapas
      // Usando solForm.formaManual si aplica
      await crearEtapasParaPedidoSiNoExisten(selected);

      // 3. Actualizar pedido directo a estado 8
      const { error: errUpd } = await supabase
        .from("pedidos_produccion")
        .update({
          fecha_entrada_mb: hoyISO(), // Se marca como cumplido este hito
          estado_id: 8,
          asignado_a: "produccion",
        })
        .eq("id", selected.id);

      if (errUpd) throw errUpd;

      alert("Etapa avanzada exitosamente.");

      // Reset form
      setSolForm({ ...solForm, formaManual: "" });

      await reloadSelected();

    } catch (error) {
      console.error("Error avanzando sin sol MB:", error);
      alert(`Error al avanzar: ${error.message}`);
    } finally {
      setSolLoading(false);
    }
  }

  async function avanzarEtapaFlujo(confirmado = false, conMicro = false) {
    if (!selected || !etapaActual) return;

    if (!confirmado) {
      const msg = conMicro
        ? `¿Confirmas solicitar análisis Microbiológico y avanzar la etapa "${etapaActual.nombre}"?`
        : `¿Confirmas avanzar/completar la etapa "${etapaActual.nombre}"?`;

      pedirConfirmacion(msg, () => avanzarEtapaFlujo(true, conMicro));
      return;
    }

    const est = (etapaActual.estado || "").toLowerCase();

    // Si está en revisión, producción no hace nada
    if (est === ESTADO_ETAPA.EN_REVISION) {
      alert("Esta etapa está en revisión. Debe liberarla el área correspondiente.");
      return;
    }

    // 1. Actualizar el estado de la etapa
    if (etapaActual.requiere_liberacion) {
      const { error } = await supabase
        .from("pedido_etapas")
        .update({
          estado: ESTADO_ETAPA.EN_REVISION,
          fecha_inicio: etapaActual.fecha_inicio || ahoraISO(),
        })
        .eq("id", etapaActual.id);

      if (error) {
        console.error(error);
        alert("Error enviando etapa a revisión.");
        return;
      }

      // Resetear liberaciones previas (por si fue rechazada antes)
      await supabase
        .from("pedido_etapas_liberaciones")
        .update({ liberada: false, comentario: "", usuario_id: null })
        .eq("pedido_etapa_id", etapaActual.id);

      // 🔔 NOTIFICAR AL LIBERADOR (MB / CC)
      try {
        const rolesRaw = (etapaActual.rol_liberador || "").toLowerCase().split(",");
        const targetRoles = [];
        rolesRaw.forEach(r => {
          if (r.includes("micro")) targetRoles.push("microbiologia");
          if (r.includes("calidad")) targetRoles.push("controlcalidad");
        });

        await notifyRoles(
          targetRoles,
          "Nueva etapa pendiente de liberar",
          `El Pedido #${selected.id} requiere liberar la etapa: "${etapaActual.nombre}".`,
          selected.id,
          "accion_requerida"
        );
      } catch (errNotif) {
        console.error("Error enviando notificación de etapa:", errNotif);
      }
    } else {
      // ✅ SI NO REQUIERE LIBERACIÓN: Producción sí puede completarla
      const { error } = await supabase
        .from("pedido_etapas")
        .update({
          estado: ESTADO_ETAPA.COMPLETADA,
          fecha_inicio: etapaActual.fecha_inicio || ahoraISO(),
          fecha_fin: ahoraISO(),
        })
        .eq("id", etapaActual.id);

      if (error) {
        console.error(error);
        alert("Error completando etapa.");
        return;
      }
    }

    // 2. --- LOGICA ESPECIFICA DE ALERTAS (definida por usuario) ---
    // Se ejecuta para AMBOS casos (liberación o completitud directa)
    try {
      const nombreEtapa = etapaActual.nombre.toLowerCase();
      const formaProd = (selected.productos?.forma_farmaceutica || "").toLowerCase();
      const ffLower = formaProd.toLowerCase();
      const esEsteril = ffLower.includes("esteril") || ffLower.includes("estéril");

      // A) SOLUCIONES ESTERILES: "Formulación"
      if (esEsteril && nombreEtapa.includes("formulación")) {
        await notifyRoles(
          ["microbiologia"],
          "Toma de Biocarga (Pre-filtración)",
          `Pedido #${selected.id} (Estéril): Formulación lista. Favor tomar biocarga pre-filtración.`,
          selected.id,
          "urgente"
        );
      }

      // B) SOLUCIONES ESTERILES: "Filtración"
      if (esEsteril && nombreEtapa.includes("filtración")) {
        await notifyRoles(
          ["microbiologia"],
          "Toma de Biocarga (Post-filtración)",
          `Pedido #${selected.id} (Estéril): Filtración finalizada. Favor tomar biocarga post-filtración.`,
          selected.id,
          "urgente"
        );
      }

      // C) SOLUCIONES ESTERILES: "Esterilización"
      if (esEsteril && nombreEtapa.includes("esterilización")) {
        await notifyRoles(
          ["microbiologia"],
          "Muestreo Microbiológico (Esterilidad)",
          `Pedido #${selected.id} (Estéril): Esterilización finalizada. Favor realizar muestreo de esterilidad.`,
          selected.id,
          "urgente"
        );
      }

      // D) NO ESTERILES: "Envasado" (Muestreo FQ y MB)
      if (!esEsteril && nombreEtapa.includes("envasado")) {
        await notifyRoles(
          ["controlcalidad", "microbiologia"],
          "Muestreo FQ y MB (Envasado)",
          `Pedido #${selected.id}: Envasado finalizado. Favor tomar muestras para análisis FQ y MB.`,
          selected.id,
          "accion_requerida"
        );
      }
    } catch (errNotif) {
      console.error("Error enviando notificaciones específicas:", errNotif);
    }

    // 3. Verificar si todo el flujo terminó y recargar
    await checkAndNotifyFlowCompletion(selected.id);

    // 4. Si se pidió MB, abrir modal
    if (conMicro) {
      setSolMsg("");
      setSolForm(prev => ({
        ...prev,
        tipo_solicitud_id: "",
        prioridad_id: "",
        descripcion: `Muestreo MB para etapa: ${etapaActual.nombre}`,
        justificacion: "",
      }));
      setShowSolicitudMB(true);
    }

    await cargarPedidoEtapas(selected.id);
  }


  /* ===========================================================
   GUARDAR ETAPA (flujo viejo por estados)
   + BLOQUEO: si intentas iniciar acondicionamiento (estado 8)
     pero el flujo no está completo => no deja
============================================================ */
  async function guardarEtapa(estadoId, confirmado = false) {
    if (!selected) {
      alert("No hay pedido seleccionado.");
      return;
    }

    // Estado 6 se maneja con Solicitud a Microbiología
    if (estadoId === 6) return;

    // BLOQUEO: antes de Acondicionamiento, deben estar completadas las etapas nuevas
    if (estadoId === 8) {
      // solo bloqueamos si existen etapas (si aún no se han creado, no bloquea)
      if (pedidoEtapas?.length && !flujoCompleto) {
        alert(
          "No puedes iniciar Acondicionamiento: aún hay etapas del flujo pendientes o sin liberar (CC/MB)."
        );
        return;
      }
    }

    const update = {};
    const nuevoAsignado = ASIGNACION_ESTADO[estadoId];
    if (nuevoAsignado) update.asignado_a = nuevoAsignado;

    // Estado 1 → aceptar pedido
    if (estadoId === 1) {
      if (!confirmado) {
        pedirConfirmacion("¿Confirmas aceptar este pedido e iniciar el proceso?", () => guardarEtapa(1, true));
        return;
      }

      const { error } = await supabase
        .from("pedidos_produccion")
        .update({ estado_id: 2, asignado_a: "produccion" })
        .eq("id", selected.id);

      if (error) {
        console.error("❌ [guardarEtapa][E1] Error:", error);
        return alert("Error aceptando pedido.");
      }

      await reloadSelected();
      return;
    }

    // Estado 2: Registro de lote
    if (estadoId === 2) {
      const { op, lote, fecha_vencimiento, tamano_lote } = formData;

      if (!op || !lote || !fecha_vencimiento || !tamano_lote) {
        alert("Complete OP, Lote, Fecha de vencimiento y Tamaño de lote.");
        return;
      }

      update.op = Math.floor(Number(op));
      update.lote = Math.floor(Number(lote));
      update.fecha_vencimiento = fecha_vencimiento;
      update.tamano_lote = Math.floor(Number(tamano_lote));

      const desp = Number(tamano_lote) * 0.03;
      update.porcentaje_desperdicio = Math.round(desp);

      update.fecha_ingreso_produccion = ahoraISO();
      update.fecha_maxima_entrega = sumarDiasHabiles(28);
    }

    // Estado 3: Asignación de fechas
    if (estadoId === 3) {
      const { fecha_propuesta_entrega } = formData;

      if (!fecha_propuesta_entrega) {
        alert("Complete la fecha propuesta de entrega.");
        return;
      }

      update.fecha_propuesta_entrega = fecha_propuesta_entrega;
    }

    // Estado 4: no se guarda desde Producción
    if (estadoId === 4) return;

    // Estado 5: Inicio de producción
    if (estadoId === 5) {
      update.fecha_inicio_produccion = ahoraISO();
      update.estado_id = 6;
      update.asignado_a = "produccion";
    }

    // Estados automáticos (8..11)
    if (estadoId >= 8 && estadoId <= 11) {
      const campoFecha = obtenerCampoFechaAuto(estadoId);
      if (campoFecha) {
        update[campoFecha] = ahoraISO();
      }
    }

    // Avanza estado por NEXT_STATE
    const nuevoEstado = NEXT_STATE[estadoId];
    if (nuevoEstado) update.estado_id = nuevoEstado;

    if (!confirmado) {
      let msg = "¿Confirmas avanzar a la siguiente etapa?";
      if (estadoId === 2) msg = "¿Confirmas guardar el registro de lote y datos?";
      if (estadoId === 3) msg = "¿Confirmas las fechas de entrega?";
      if (estadoId === 5) msg = "¿Confirmas iniciar la Producción?";
      if (estadoId === 8) msg = "¿Confirmas iniciar el proceso de Acondicionamiento?";
      if (estadoId === 9) msg = "¿Confirmas finalizar Acondicionamiento y enviar a Calidad?";

      pedirConfirmacion(msg, () => guardarEtapa(estadoId, true));
      return;
    }

    const { error } = await supabase
      .from("pedidos_produccion")
      .update(update)
      .eq("id", selected.id);

    if (error) {
      console.error("❌ [guardarEtapa] Error Supabase:", error);
      alert("Error guardando etapa (ver consola).");
      return;
    }

    await reloadSelected();
    setFormData({});
  }

  /* ===========================================================
     OBSERVACIONES
  ============================================================ */
  async function addObservacion() {
    if (!selected) return alert("No hay pedido seleccionado.");
    if (!newObs.trim()) return;

    const { error } = await supabase.from("observaciones_pedido").insert([
      {
        pedido_id: selected.id,
        usuario: rolUsuario,
        observacion: newObs,
      },
    ]);

    if (error) {
      console.error("❌ [addObservacion] Error:", error);
      alert("Error guardando observación.");
      return;
    }

    setNewObs("");
    cargarObservaciones(selected.id);
  }

  /* ===========================================================
     HISTORIAL (viejo)
  ============================================================ */
  function renderHistorial() {
    if (!selected) return null;

    const eventos = [];

    if (selected.fecha_recepcion_cliente) {
      eventos.push({
        fecha: selected.fecha_recepcion_cliente,
        titulo: "Recepción del pedido",
        detalle: "Pedido ingresado por Atención al Cliente",
      });
    }

    if (selected.op || selected.lote || selected.fecha_vencimiento) {
      eventos.push({
        fecha: selected.fecha_ingreso_produccion,
        titulo: "Registro de lote",
        detalle: `OP: ${selected.op || "-"}, Lote: ${selected.lote || "-"}, Vence: ${selected.fecha_vencimiento || "-"
          }`,
      });
    }

    if (selected.fecha_maxima_entrega || selected.fecha_propuesta_entrega) {
      eventos.push({
        fecha: selected.fecha_propuesta_entrega,
        titulo: "Asignación de fechas",
        detalle: `Máxima: ${selected.fecha_maxima_entrega}, Propuesta: ${selected.fecha_propuesta_entrega}`,
      });
    }

    if (selected.fecha_solicitud_materias_primas) {
      eventos.push({
        fecha: selected.fecha_solicitud_materias_primas,
        titulo: "Solicitud de materias primas",
        detalle: "Solicitud enviada a Bodega",
      });
    }

    if (selected.fecha_entrega_de_materias_primas_e_insumos) {
      eventos.push({
        fecha: selected.fecha_entrega_de_materias_primas_e_insumos,
        titulo: "Entrega de materias primas",
        detalle: "Insumos entregados por Bodega",
      });
    }

    const autoFechas = [
      ["fecha_inicio_produccion", "Inicio de producción"],
      ["fecha_entrada_mb", "Solicitud MB (Entrada MB)"],
      ["fecha_inicio_acondicionamiento", "Inicio de acondicionamiento"],
      ["fecha_fin_acondicionamiento", "Fin de acondicionamiento"],
      ["fecha_liberacion_pt", "Liberación PT"],
      ["fecha_entrega_bodega", "Entrega a bodega"],
    ];

    autoFechas.forEach(([campo, titulo]) => {
      if (selected[campo]) {
        eventos.push({ fecha: selected[campo], titulo, detalle: "" });
      }
    });

    eventos.sort((a, b) => (a.fecha > b.fecha ? -1 : 1));

    if (eventos.length === 0) return <p className="pc-empty">Aún no hay historial disponible.</p>;

    return eventos.map((ev, i) => (
      <div key={i} className="pc-hist-item">
        <p className="pc-hist-fecha">{ev.fecha}</p>
        <p className="pc-hist-titulo">{ev.titulo}</p>
        {ev.detalle && <p className="pc-hist-detalle">{ev.detalle}</p>}
      </div>
    ));
  }

  /* ===========================================================
     HELPERS UI
  ============================================================ */
  const puedeEditar =
    selected &&
    (!selected.asignado_a || selected.asignado_a.trim().toLowerCase() === "produccion");

  const pedidosFiltrados = pedidos.filter((p) => {
    const texto = filtroTexto.toLowerCase();

    const coincideTexto =
      !texto ||
      p.productos?.articulo?.toLowerCase().includes(texto) ||
      p.clientes?.nombre?.toLowerCase().includes(texto) ||
      (p.op && String(p.op).toLowerCase().includes(texto));

    const coincideEstado =
      filtroEstado === "todos" || String(p.estado_id) === String(filtroEstado);

    const coincideAsignado =
      filtroAsignado === "todos" ||
      (filtroAsignado === "produccion" && p.asignado_a === "produccion") ||
      (filtroAsignado === "bodega" && p.asignado_a === "bodega") ||
      (filtroAsignado === "sin" && !p.asignado_a);

    return coincideTexto && coincideEstado && coincideAsignado;
  });

  /* ===========================================================
     RENDER: bloque de flujo nuevo
  ============================================================ */
  function renderFlujoNuevo() {
    if (!selected) return null;

    return (
      <div className="pc-box" style={{ marginTop: 14 }}>
        <h4>🧩 Etapas internas (flujo por forma farmacéutica)</h4>

        {etapasLoading && <p style={{ marginTop: 8 }}>Cargando etapas…</p>}

        {!etapasLoading && (!pedidoEtapas || pedidoEtapas.length === 0) && (
          <p style={{ marginTop: 8, color: "#64748b" }}>
            Aún no hay etapas creadas para este pedido. Se crean automáticamente cuando envías la Solicitud a Microbiología.
          </p>
        )}

        {!etapasLoading && pedidoEtapas?.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              <span className="pc-chip">
                Total: {pedidoEtapas.length}
              </span>
              <span className={`pc-chip ${flujoCompleto ? "estado-12" : "estado-6"}`}>
                {flujoCompleto ? "Flujo completo" : `Pendientes: ${etapasPendientes.length}`}
              </span>
            </div>

            <div style={{ marginTop: 10 }}>
              {pedidoEtapas.map((e) => {
                const est = (e.estado || "").toLowerCase();
                const chip =
                  est === "completada" ? "estado-12" :
                    est === "en_revision" ? "estado-6" :
                      "estado-4";

                return (
                  <div key={e.id} className="pc-hist-item" style={{ borderLeft: "3px solid #e2e8f0" }}>
                    <p className="pc-hist-fecha">#{e.orden}</p>
                    <p className="pc-hist-titulo">
                      {e.nombre}{" "}
                      <span className={`pc-chip ${chip}`} style={{ marginLeft: 8 }}>
                        {est || "pendiente"}
                      </span>
                      {e.requiere_liberacion && (
                        <span className="pc-chip" style={{ marginLeft: 8 }}>
                          Libera: {e.rol_liberador}
                        </span>
                      )}
                    </p>
                    <p className="pc-hist-detalle" style={{ marginTop: 4 }}>
                      Inicio: {e.fecha_inicio ? new Date(e.fecha_inicio).toLocaleString("es-CO") : "-"}{" "}
                      | Fin: {e.fecha_fin ? new Date(e.fecha_fin).toLocaleString("es-CO") : "-"}
                    </p>
                  </div>
                );
              })}
            </div>

            {etapaActual && (
              <div style={{ marginTop: 12 }}>
                <p style={{ marginBottom: 8 }}>
                  <strong>Etapa actual:</strong> #{etapaActual.orden} – {etapaActual.nombre}
                </p>

                {(() => {
                  const est = (etapaActual.estado || "").toLowerCase();

                  const ff = (selected.productos?.forma_farmaceutica || "").toLowerCase();
                  const esEsteril = ff.includes("esteril") || ff.includes("estéril");
                  const nombreBajo = etapaActual.nombre.toLowerCase();

                  // Regla: No estériles -> Envasado. Estériles -> Esterilización.
                  const esEtapaCorrectaMB = esEsteril
                    ? nombreBajo.includes("esterilización")
                    : nombreBajo.includes("envasado");

                  if (est === "en_revision") {
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <p style={{ color: "#b45309" }}>
                          ⏳ Esta etapa está en revisión. Pendiente por:{" "}
                          <strong>
                            {(etapaActual.pedido_etapas_liberaciones || [])
                              .filter(l => !l.liberada)
                              .map(l => l.rol)
                              .join(", ") || etapaActual.rol_liberador}
                          </strong>
                        </p>
                        {esEtapaCorrectaMB && !haSolicitadoMicro && (
                          <button
                            className="pc-btn"
                            style={{ background: "#7c3aed", width: 'fit-content' }}
                            onClick={() => {
                              setSolMsg("");
                              setSolForm(prev => ({
                                ...prev,
                                tipo_solicitud_id: "",
                                prioridad_id: "",
                                descripcion: `Muestreo MB para ${etapaActual.nombre} (En revisión)`,
                                justificacion: "",
                              }));
                              setShowSolicitudMB(true);
                            }}
                          >
                            🧫 Solicitar Microbiología (si no se ha hecho)
                          </button>
                        )}
                      </div>
                    );
                  }

                  if (etapaActual.requiere_liberacion) {
                    return (
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        {esEtapaCorrectaMB ? (
                          <button
                            className="pc-btn"
                            style={{ background: "#2563eb" }}
                            onClick={() => avanzarEtapaFlujo(false, true)}
                          >
                            🚀 Enviar a revisión y Solicitar MB
                          </button>
                        ) : (
                          <button className="pc-btn" onClick={() => avanzarEtapaFlujo()}>
                            Enviar a revisión ({etapaActual.rol_liberador?.split(',').join(' + ')})
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      {esEtapaCorrectaMB ? (
                        <button
                          className="pc-btn"
                          style={{ background: "#22c55e" }}
                          onClick={() => avanzarEtapaFlujo(false, true)}
                        >
                          ✅ Completar etapa y Solicitar MB
                        </button>
                      ) : (
                        <button className="pc-btn" onClick={() => avanzarEtapaFlujo()}>
                          Completar etapa (sin liberación)
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  /* ===========================================================
     FORMULARIO DINÁMICO POR ESTADO (flujo viejo)
  ============================================================ */
  /* ===========================================================
     CANCELACIÓN DE PEDIDO
  =========================================================== */
  function clickCancelarPedido() {
    setCancelReason("");
    setShowCancelModal(true);
  }

  async function confirmarCancelacion() {
    if (!cancelReason.trim()) {
      alert("Debes escribir un motivo para cancelar.");
      return;
    }
    setCancelLoading(true);

    try {
      // 1. Insertar observación con motivo
      const { error: errObs } = await supabase.from("observaciones_pedido").insert([{
        pedido_id: selected.id,
        usuario: usuarioActual?.usuario || usuarioActual?.email || "Producción",
        observacion: `🚫 PEDIDO CANCELADO. Motivo: ${cancelReason}`
      }]);
      if (errObs) throw errObs;

      // 2. Actualizar estado a 22 (Cancelado)
      const { error: errUpd } = await supabase
        .from("pedidos_produccion")
        .update({ estado_id: 22, asignado_a: null })
        .eq("id", selected.id);

      if (errUpd) throw errUpd;

      // 3. Recargar
      await loadPedidos();
      if (selected) {
        setSelected(prev => ({ ...prev, estado_id: 22 }));
      }
      setShowCancelModal(false);

      // Feedback opcional
      setConfirmData({
        isOpen: true,
        msg: "El pedido ha sido cancelado exitosamente.",
        action: () => Promise.resolve()
      });

    } catch (error) {
      console.error("Error cancelando:", error);
      alert("Error al cancelar el pedido.");
    } finally {
      setCancelLoading(false);
    }
  }

  function renderEtapa() {
    if (!selected) return null;

    // BLOQUEO SI ESTÁ CANCELADO
    if (selected.estado_id === 22) {
      return (
        <div style={{ padding: 20, background: "#fee2e2", border: "1px solid #ef4444", borderRadius: 8, color: "#991b1b" }}>
          <strong>⛔ Pedido Cancelado</strong>
          <p style={{ margin: "5px 0 0" }}>No se pueden realizar acciones sobre este pedido.</p>
        </div>
      );
    }

    const e = selected.estado_id;
    const prod = selected.productos || {};

    if (e === 1) {
      return (
        <div className="pc-box">
          <h4>Pedido pendiente</h4>
          <p>Este pedido aún no ha sido aceptado por Producción.</p>
          <button className="pc-btn" onClick={() => guardarEtapa(1)}>
            ✔️ Aceptar pedido
          </button>
        </div>
      );
    }

    const bloqueaAcond = e === 8 && pedidoEtapas?.length > 0 && !flujoCompleto;

    const inputs = {
      2: (
        <>
          <label>OP</label>
          <input
            type="number"
            value={formData.op ?? selected.op ?? ""}
            onChange={(ev) => setFormData({ ...formData, op: ev.target.value })}
            disabled={!puedeEditar}
          />

          <label>Lote</label>
          <input
            type="number"
            value={formData.lote ?? selected.lote ?? ""}
            onChange={(ev) => setFormData({ ...formData, lote: ev.target.value })}
            disabled={!puedeEditar}
          />

          <label>Fecha de vencimiento (MM-AAAA)</label>
          <input
            type="month"
            value={formData.fecha_vencimiento ?? selected.fecha_vencimiento ?? ""}
            onChange={(ev) => setFormData({ ...formData, fecha_vencimiento: ev.target.value })}
            disabled={!puedeEditar}
          />

          <label>Tamaño de lote</label>
          <input
            type="number"
            value={formData.tamano_lote ?? selected.tamano_lote ?? ""}
            onChange={(ev) => setFormData({ ...formData, tamano_lote: ev.target.value })}
            disabled={!puedeEditar}
          />

          <label>% Desperdicio (3% del tamaño)</label>
          <input
            type="text"
            disabled
            value={
              formData.tamano_lote
                ? Math.round(Number(formData.tamano_lote) * 0.03)
                : selected.porcentaje_desperdicio ?? ""
            }
          />

          <hr />

          <label>Nombre para registro de lote</label>
          <input type="text" value={prod.nombre_registro_lote || ""} disabled />

          <label>Presentación comercial</label>
          <input type="text" value={prod.presentacion_comercial || ""} disabled />

          <label>Forma farmacéutica</label>
          <input type="text" value={prod.forma_farmaceutica || ""} disabled />
        </>
      ),

      3: (
        <>
          <label>Fecha máxima de entrega (28 días hábiles)</label>
          <input
            type="date"
            value={formData.fecha_maxima_entrega || selected.fecha_maxima_entrega || ""}
            readOnly
            style={{ backgroundColor: "#f0f0f0", cursor: "not-allowed" }}
          />

          <label>Fecha propuesta de entrega (Producción)</label>
          <input
            type="date"
            value={formData.fecha_propuesta_entrega ?? selected.fecha_propuesta_entrega ?? ""}
            onChange={(ev) => setFormData({ ...formData, fecha_propuesta_entrega: ev.target.value })}
            disabled={!puedeEditar}
          />
        </>
      ),

      4: (
        <div style={{ textAlign: "center", fontStyle: "italic", color: "#64748b" }}>
          <p>
            La gestión de materias primas se visualiza en la sección superior
            <br />
            <strong>"📦 Materias primas / insumos"</strong>.
          </p>
        </div>
      ),

      5: (
        <>
          <p>
            Al guardar, se registrará la <strong>Fecha inicio de producción</strong> con la fecha de hoy.
          </p>
          <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
            <button
              className="pc-btn"
              onClick={() => devolverABodega()}
              style={{ background: '#ef4444' }}
            >
              🚫 Devolver a Bodega por materia prima incompleta
            </button>
          </div>
        </>
      ),

      6: (
        <>
          {(() => {
            const formaProd = (selected.productos?.forma_farmaceutica || "").trim();
            const formaManual = (solForm.formaManual || "").trim();
            const formaReal = formaManual || formaProd;

            // Buscar si es válida en flujos (case insensitive)
            const flujoValido = flujos.find(f =>
              f.forma_farmaceutica.trim().toLowerCase() === formaReal.toLowerCase()
            );

            // 1. Si NO es válida (o vacía), mostrar selector Warning
            if (!flujoValido) {
              return (
                <div style={{ background: "#fffbeb", padding: "10px", borderRadius: "6px", border: "1px solid #fcd34d" }}>
                  <p style={{ fontSize: "13px", color: "#b45309", marginBottom: "5px" }}>
                    ⚠️ {formaReal
                      ? `La forma "${formaReal}" no tiene flujo activo.`
                      : "Este producto no tiene Forma Farmacéutica asociada."}
                    <br />
                    Seleccione una válida para generar el control de etapas.
                  </p>
                  <label style={{ color: "#b45309", fontWeight: 'bold', display: 'block', marginBottom: 4 }}>Forma Farmacéutica *</label>
                  <select
                    value={solForm.formaManual}
                    onChange={(e) => setSolForm({ ...solForm, formaManual: e.target.value })}
                    style={{ border: "1px solid #fcd34d", width: '100%', padding: '6px', borderRadius: '4px' }}
                  >
                    <option value="">Seleccione forma...</option>
                    {flujos.map((f) => (
                      <option key={f.id} value={f.forma_farmaceutica}>
                        {f.forma_farmaceutica}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            // 2. Es válida. Check si es ESTÉRIL
            const valNorm = flujoValido.forma_farmaceutica.toUpperCase();
            const esEsteril = valNorm.includes("SOLUCIONES ESTERILES") || valNorm.includes("SOLUCIONES ESTÉRILES");

            if (esEsteril) {
              // CASO A: REQUIERE SOLICITUD
              return (
                <>
                  <p>
                    Para continuar, debes enviar una <strong>solicitud a Microbiología</strong>.
                    Al enviarla se registrará la <strong>Fecha entrada MB</strong> y el pedido pasará a <strong>etapas internas</strong>.
                  </p>
                  <button
                    className="pc-btn"
                    onClick={() => {
                      if (!areaMicroId) {
                        alert("No se encontró el área de Microbiología en la tabla 'areas'.");
                        return;
                      }
                      setSolMsg("");
                      // Reset form but keep manual form if set
                      setSolForm(prev => ({
                        ...prev,
                        tipo_solicitud_id: "",
                        prioridad_id: "",
                        descripcion: "",
                        justificacion: "",
                      }));
                      setShowSolicitudMB(true);
                    }}
                  >
                    🧫 Crear solicitud a Microbiología
                  </button>
                </>
              );
            } else {
              // CASO B: NO REQUIERE SOLICITUD
              return (
                <>
                  <p>
                    La forma farmacéutica <strong>{flujoValido.forma_farmaceutica}</strong> no requiere solicitud de liberación de área a Microbiología.
                  </p>
                  <button
                    className="pc-btn"
                    onClick={avanzarSinSolicitudMB}
                    style={{ backgroundColor: '#22c55e', borderColor: '#16a34a' }}
                  >
                    🚀 Iniciar etapas internas
                  </button>
                </>
              );
            }

          })()}
        </>
      ),

      8: (
        <>
          {bloqueaAcond ? (
            <p style={{ color: "#b91c1c" }}>
              ⛔ No puedes iniciar Acondicionamiento: aún hay etapas del flujo pendientes o sin liberar (CC/MB).
            </p>
          ) : (
            <p>
              Al guardar, se registrará la <strong>Fecha inicio de acondicionamiento</strong> con la fecha de hoy.
            </p>
          )}
        </>
      ),

      9: (
        <p>
          Al guardar, se registrará la <strong>Fecha fin de acondicionamiento</strong> con la fecha de hoy.
        </p>
      ),

      10: (
        <p>
          Al guardar, se registrará la <strong>Fecha liberación PT</strong> con la fecha de hoy.
        </p>
      ),

      11: (
        <div style={{ background: "#ecfdf5", padding: "10px", borderRadius: "6px", border: "1px solid #10b981" }}>
          <p style={{ fontSize: "13px", color: "#065f46" }}>
            ✅ Esta etapa (Entrega a Bodega) es gestionada por <strong>Bodega</strong> y <strong>Atención al Cliente</strong>.
          </p>
        </div>
      ),
    };

    const contenido = inputs[e];

    if (!contenido) {
      return (
        <div className="pc-box">
          <p>No hay formulario configurado para este estado.</p>
        </div>
      );
    }

    const estadosSinBoton = [1, 4, 6];
    const muestraBotonGuardar = puedeEditar && !estadosSinBoton.includes(e) && !(e === 8 && bloqueaAcond);

    return (
      <div className="pc-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="Shift + Click para ver insumos (si existen)"
            onClick={(e) => {
              if (e.shiftKey && itemsSolicitados.length > 0) {
                setShowItemsSolicitados(true);
              }
            }}
          >
            {selected.estado_id === 6
              ? "Solicitud de liberación de área a Microbiología"
              : selected.estados?.nombre}
          </h4>
        </div>

        {contenido}

        {/* Modal removed. Details are now shown inline in the Materias Primas section */}




        {muestraBotonGuardar && (
          <button className="pc-btn" onClick={() => guardarEtapa(e)}>
            {e === 5 ? "Confirmar recibido de materia prima e iniciar produccion" : "Guardar etapa"}
          </button>
        )}

        {!puedeEditar && e !== 4 && (
          <p style={{ marginTop: 8, fontSize: 13, color: "#777" }}>
            Este pedido está asignado a <strong>{selected.asignado_a}</strong>. No puedes editarlo desde Producción.
          </p>
        )}
      </div>
    );
  }

  /* ===========================================================
     RENDER PRINCIPAL
  ============================================================ */
  return (
    <>
      <Navbar />

      <div className="pc-wrapper">
        {/* LISTA IZQUIERDA */}
        <div className="pc-list">
          <h2>🏭 Producción</h2>

          <div className="pc-filters">
            <input
              type="text"
              placeholder="Buscar por producto o cliente…"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
            />

            <select
              className="pc-select"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="todos">Todos los estados</option>
              <option value="1">Pendiente</option>
              <option value="2">Registro de lote</option>
              <option value="3">Asignación de fechas</option>
              <option value="4">Materias primas / insumos</option>
              <option value="5">Inicio producción</option>
              <option value="6">Entrada MB</option>
              <option value="8">Inicio acond.</option>
              <option value="9">Fin acond.</option>
              <option value="10">Liberación PT</option>
              <option value="11">Entrega bodega</option>
              <option value="12">Producción finalizada</option>
            </select>

            <select
              className="pc-select"
              value={filtroAsignado}
              onChange={(e) => setFiltroAsignado(e.target.value)}
            >
              <option value="todos">Asignación: todos</option>
              <option value="produccion">Solo Producción</option>
              <option value="bodega">Solo Bodega</option>
              <option value="sin">Sin asignar</option>
            </select>
          </div>

          {pedidosFiltrados.map((p) => (
            <div
              key={p.id}
              className={`pc-item ${selected?.id === p.id ? "pc-item-selected" : ""}`}
              onClick={() => seleccionarPedido(p)}
            >
              <span className="pc-id-tag">#{p.id}</span>

              <h4>{p.productos?.articulo}</h4>
              <small style={{ display: 'block', color: '#64748b', marginBottom: '4px' }}>
                orden produccion: {p.op || "—"}
              </small>
              <p>
                <strong>Cliente:</strong> {p.clientes?.nombre}
              </p>
              <p>
                <strong>Cantidad:</strong> {p.cantidad}
              </p>
              <p>
                <strong>Estado:</strong>{" "}
                <span className={`pc-chip estado-${p.estado_id}`}>
                  {(() => {
                    if (p.estado_id === 8) {
                      const nombreEtapa = etapasDict[p.id];
                      return nombreEtapa ? `Etapas internas - ${nombreEtapa}` : "Entrada Acondicionamiento";
                    }
                    return p.estados?.nombre;
                  })()}
                </span>
              </p>

              <p style={{ fontSize: "13px", marginTop: "6px", color: "#475569" }}>
                <strong>Asignado a:</strong> {p.asignado_a || "Sin asignar"}
              </p>
            </div>
          ))}

          {pedidosFiltrados.length === 0 && (
            <p style={{ marginTop: 10, fontSize: 14, color: "#777" }}>
              No hay pedidos que coincidan con el filtro.
            </p>
          )}
        </div>

        {/* DETALLE DERECHA */}
        {selected && (
          <div className="pc-detail fadeIn">

            {/* 1. DETALLE DEL PEDIDO */}
            <CollapsibleSection
              title="📄 Detalle del Pedido"
              isOpen={expanded.detalle}
              onToggle={() => toggleSection("detalle")}
            >
              <div className="pc-detail-grid">
                <p>
                  <strong>Producto:</strong> {selected.productos?.articulo}
                </p>
                <p>
                  <strong>Cliente:</strong> {selected.clientes?.nombre}
                </p>
                <p>
                  <strong>Cantidad:</strong> {selected.cantidad}
                </p>
                <p>
                  <strong>Prioridad:</strong> {selected.prioridad || "Normal"}
                </p>
                <p>
                  <strong>Lote:</strong> {selected.lote || "—"}
                </p>
                <p>
                  <strong>OP:</strong> {selected.op || "—"}
                </p>
                <p>
                  <strong>Tam. Lote:</strong> {selected.tamano_lote || "—"}
                </p>
                <p>
                  <strong>Fecha Max:</strong> {selected.fecha_maxima_entrega || "—"}
                </p>
                <p>
                  <strong>Fecha Prop.:</strong> {selected.fecha_propuesta_entrega || "—"}
                </p>
                <p>
                  <strong>Estado:</strong>{" "}
                  <span className={`pc-chip estado-${selected.estado_id}`}>
                    {selected.estado_id === 8
                      ? (flujoCompleto ? "Entrada Acondicionamiento" : "Etapas internas")
                      : selected.estados?.nombre}
                  </span>{" "}
                  <span className={`pc-chip-asignado asignado-${selected.asignado_a || "sin"}`}>
                    {selected.asignado_a || "Sin asignar"}
                  </span>
                </p>
              </div>
            </CollapsibleSection>

            {/* 2. ESTADO DEL PEDIDO */}
            {/* 1.5 MATERIAS PRIMAS / INSUMOS (PERSISTENTE) */}
            {(selected.estado_id >= 4) && (
              <CollapsibleSection
                title="📦 Materias primas / insumos"
                isOpen={expanded.materias}
                onToggle={(e) => {
                  if (e.shiftKey) {
                    if (e.stopPropagation) e.stopPropagation();
                    setShowItemsSolicitados(true);
                  } else {
                    toggleSection("materias");
                  }
                }}
              >
                <div style={{ padding: '10px' }}>
                  {/* ESTADO: ESPERANDO ENTREGA */}
                  {selected.fecha_solicitud_materias_primas && !selected.fecha_entrega_de_materias_primas_e_insumos && (
                    <div style={{
                      padding: "10px",
                      backgroundColor: "#fff7ed",
                      border: "1px solid #fdba74",
                      borderRadius: "6px",
                      color: "#9a3412",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "15px"
                    }}>
                      <span>🕒</span>
                      <strong>Esperando a que bodega entregue la materia prima...</strong>
                    </div>
                  )}

                  {/* ESTADO: ENTREGADO */}
                  {selected.fecha_entrega_de_materias_primas_e_insumos && (
                    <div style={{
                      padding: "10px",
                      backgroundColor: "#ecfdf5",
                      border: "1px solid #6ee7b7",
                      borderRadius: "6px",
                      color: "#065f46",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "15px"
                    }}>
                      <span>✅</span>
                      <strong>Materias primas entregadas por Bodega.</strong>
                    </div>
                  )}

                  {/* DATES */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                        Fecha solicitud
                      </label>
                      <input
                        type="date"
                        value={selected.fecha_solicitud_materias_primas || ""}
                        disabled
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                        Fecha entrega
                      </label>
                      <input
                        type="date"
                        value={selected.fecha_entrega_de_materias_primas_e_insumos || ""}
                        disabled
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc' }}
                      />
                    </div>
                  </div>

                  {/* INLINE DETAIL LIST (Secret) */}
                  {showItemsSolicitados && (
                    <div className="fadeIn" style={{ marginTop: '20px', borderTop: '1px dashed #cbd5e1', paddingTop: '15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h4 style={{ margin: 0, fontSize: '14px', color: '#334155' }}>📋 Detalle de Insumos</h4>
                        <small
                          style={{ cursor: 'pointer', color: '#ef4444', textDecoration: 'underline' }}
                          onClick={() => setShowItemsSolicitados(false)}
                        >
                          Ocultar
                        </small>
                      </div>

                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid #cbd5e1', color: '#64748b' }}>
                              <th style={{ padding: '6px' }}>Insumo</th>
                              <th style={{ padding: '6px', textAlign: 'center' }}>⚠️</th>
                              <th style={{ padding: '6px' }}>Cant.</th>
                              <th style={{ padding: '6px' }}>Entr.</th>
                              <th style={{ padding: '6px' }}>Obs.</th>
                              <th style={{ padding: '6px', textAlign: 'center' }}>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {itemsSolicitados.map(it => (
                              <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9', background: it.es_critico ? '#fff1f2' : 'transparent' }}>
                                <td style={{ padding: '6px' }}>
                                  <strong style={{ color: '#0f172a' }}>{it.articulo_nombre}</strong>
                                  <div style={{ color: '#94a3b8', fontSize: '10px' }}>{it.unidad}</div>
                                </td>
                                <td style={{ padding: '6px', textAlign: 'center' }}>
                                  {it.es_critico && "⚠️"}
                                </td>
                                <td style={{ padding: '6px' }}>{it.cantidad}</td>
                                <td style={{ padding: '6px', fontWeight: 'bold' }}>
                                  {it.cantidad_entregada || "-"}
                                </td>
                                <td style={{ padding: '6px', fontStyle: 'italic', color: '#64748b', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.observacion}>
                                  {it.observacion || "-"}
                                </td>
                                <td style={{ padding: '6px', textAlign: 'center' }}>
                                  {it.completado ? "✅" : "⏳"}
                                </td>
                              </tr>
                            ))}
                            {itemsSolicitados.length === 0 && (
                              <tr>
                                <td colSpan="6" style={{ padding: '10px', textAlign: 'center', color: '#94a3b8' }}>
                                  No hay items solicitados cargados.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {/* BOTÓN SOLICITAR (Solo si no se ha solicitado y se puede editar) */}
                  {puedeEditar && !selected.fecha_solicitud_materias_primas && (
                    <div style={{ marginTop: '15px' }}>
                      <button
                        className="pc-btn"
                        onClick={(e) => {
                          if (e.shiftKey) {
                            setShowMaterialModal(true);
                          } else {
                            solicitarMateriasPrimas();
                          }
                        }}
                      >
                        Solicitar materias primas a Bodega
                      </button>
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            )}

            <CollapsibleSection
              title="📌 Estado del Pedido"
              isOpen={expanded.estado}
              onToggle={() => toggleSection("estado")}
            >
              {renderEtapa()}
            </CollapsibleSection>

            {/* 3. ETAPAS (Flujo) */}
            <CollapsibleSection
              title="🧩 Etapas internas (flujo por forma farmacéutica)"
              isOpen={expanded.etapas}
              onToggle={() => toggleSection("etapas")}
            >
              {selected.estado_id === 22 ? (
                <div style={{ padding: 10, color: "#991b1b", fontStyle: "italic" }}>
                  ⛔ No disponible (Pedido Cancelado)
                </div>
              ) : (
                renderFlujoNuevo()
              )}
            </CollapsibleSection>

            {/* 3. OBSERVACIONES */}
            <CollapsibleSection
              title="📝 Observaciones"
              isOpen={expanded.obs}
              onToggle={() => toggleSection("obs")}
            >
              <div className="pc-observaciones">
                {obs.length === 0 && <p className="pc-empty">No hay observaciones aún.</p>}
                {obs.map((o) => (
                  <div key={o.id} className="pc-obs-item">
                    <p>{o.observacion}</p>
                    <span>
                      {o.usuario} – {new Date(o.created_at).toLocaleString("es-CO")}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pc-add-obs">
                <textarea
                  rows="2"
                  placeholder="+ Añadir observación…"
                  value={newObs}
                  onChange={(e) => setNewObs(e.target.value)}
                />
                <button onClick={addObservacion}>➕ Agregar</button>
              </div>
            </CollapsibleSection>



            {/* 4. HISTORIAL */}
            <CollapsibleSection
              title="📚 Historial y Detalles"
              isOpen={expanded.historial}
              onToggle={() => toggleSection("historial")}
            >
              <div className="pc-historial">{renderHistorial()}</div>
            </CollapsibleSection>

            {/* BOTÓN CANCELAR (Solo Producción y si no está cancelado/finalizado) */}
            {esProduccion && selected.estado_id !== 22 && selected.estado_id !== 12 && (
              <button
                className="pc-btn"
                style={{ marginTop: 20, background: "#ef4444" }}
                onClick={clickCancelarPedido}
              >
                🛑 Cancelar Pedido
              </button>
            )}
          </div>
        )}
      </div>

      {/* ==========================
          MODAL CANCELACIÓN
         ========================== */}
      {showCancelModal && (
        <div className="modal-backdrop" style={{ zIndex: 10001 }}>
          <div className="modal-card">
            <h3>🛑 Cancelar Pedido #{selected?.id}</h3>
            <p style={{ marginTop: 6, color: "#64748b", fontSize: "14px" }}>
              Esta acción detendrá el flujo del pedido. Es obligatorio indicar el motivo.
            </p>

            <textarea
              rows="3"
              placeholder="Indica el motivo de la cancelación..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              style={{ marginTop: 15, borderColor: "#ef4444" }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
              <button
                className="pc-btn"
                style={{ background: "#f1f5f9", color: "#475569" }}
                onClick={() => setShowCancelModal(false)}
                disabled={cancelLoading}
              >
                Volver
              </button>
              <button
                className="pc-btn"
                style={{ background: "#ef4444" }}
                onClick={confirmarCancelacion}
                disabled={cancelLoading}
              >
                {cancelLoading ? "Cancelando..." : "Confirmar Cancelación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================
          MODAL SOLICITUD MB (sin Área)
         ========================== */}
      {showSolicitudMB && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>🧫 Solicitud a Microbiología</h3>
            <p style={{ marginTop: 6, color: "#475569" }}>
              Pedido #{selected?.id} – {selected?.productos?.articulo}
            </p>

            {/* SELECCIÓN MANUAL DE FORMA FARMACÉUTICA (Si falta o es inválida) */}
            {(() => {
              const formaProd = (selected?.productos?.forma_farmaceutica || "").trim();
              const esValida = formaProd && flujos.some(f =>
                f.forma_farmaceutica.trim().toLowerCase() === formaProd.toLowerCase()
              );

              // Si YA es válida, no preguntamos de nuevo (solo si no la tiene o es inválida)
              if (esValida) return null;

              return (
                <div style={{ background: "#fffbeb", padding: "10px", borderRadius: "6px", marginBottom: "15px", border: "1px solid #fcd34d" }}>
                  <p style={{ fontSize: "13px", color: "#b45309", marginBottom: "5px" }}>
                    ⚠️ {formaProd
                      ? `La forma "${formaProd}" no tiene flujo activo.`
                      : "Este producto no tiene Forma Farmacéutica asociada."}
                    <br />
                    Seleccione una válida para generar el control de etapas.
                  </p>
                  <label style={{ color: "#b45309" }}>Forma Farmacéutica *</label>
                  <select
                    value={solForm.formaManual}
                    onChange={(e) => setSolForm({ ...solForm, formaManual: e.target.value })}
                    style={{ border: "1px solid #fcd34d" }}
                  >
                    <option value="">Seleccione forma...</option>
                    {flujos.map((f) => (
                      <option key={f.id} value={f.forma_farmaceutica}>
                        {f.forma_farmaceutica}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}

            <label>Tipo de solicitud *</label>
            <select
              value={solForm.tipo_solicitud_id}
              onChange={(e) => setSolForm({ ...solForm, tipo_solicitud_id: e.target.value })}
            >
              <option value="">Seleccione...</option>
              {tiposFiltrados.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>

            <label>Prioridad *</label>
            <select
              value={solForm.prioridad_id}
              onChange={(e) => setSolForm({ ...solForm, prioridad_id: e.target.value })}
            >
              <option value="">Seleccione...</option>
              {prioridades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>

            {solForm.tipo_solicitud_id && (
              <CamposDinamicos
                tipo={solForm.tipo_solicitud_id}
                form={solForm}
                setForm={setSolForm}
              />
            )}

            <label>Descripción general *</label>
            <textarea
              rows="3"
              value={solForm.descripcion}
              onChange={(e) => setSolForm({ ...solForm, descripcion: e.target.value })}
            />

            <label>Justificación (opcional)</label>
            <textarea
              rows="2"
              value={solForm.justificacion}
              onChange={(e) => setSolForm({ ...solForm, justificacion: e.target.value })}
            />

            {solMsg && <p style={{ marginTop: 10 }}>{solMsg}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
              <button
                className="pc-btn"
                style={{ background: "#64748b" }}
                onClick={() => setShowSolicitudMB(false)}
                disabled={solLoading}
              >
                Cancelar
              </button>
              <button className="pc-btn" onClick={enviarSolicitudMBYContinuar} disabled={solLoading}>
                {solLoading ? "Enviando..." : "Enviar y continuar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================
          MODAL CONFIRMACIÓN GENÉRICA
          ========================== */}
      {confirmData.isOpen && (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="modal-card" style={{ maxWidth: 400, textAlign: "center" }}>
            <h3 style={{ marginBottom: 14 }}>⚠️ Confirmar Acción</h3>
            <p style={{ margin: "10px 0 20px", fontSize: "1.05rem", color: "#334155" }}>
              {confirmData.msg || "¿Estás seguro de realizar esta acción?"}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                className="pc-btn"
                style={{ background: "#94a3b8", marginTop: 0 }}
                onClick={cancelarConfirmacion}
              >
                Cancelar
              </button>
              <button
                className="pc-btn"
                style={{ marginTop: 0 }}
                onClick={ejecutarConfirmacion}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
      {/* ===========================================================
          MODAL SELECCIÓN DE MATERIALES (DETALLADO)
      =========================================================== */}
      {showMaterialModal && (
        <div className="cal-modal-backdrop" onClick={() => setShowMaterialModal(false)}>
          <div className="cal-modal" style={{ width: '600px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '15px' }}>📦 Detalle de Solicitud de Materiales</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
              Selecciona los insumos y las cantidades que necesitas para el Pedido #{selected?.id}.
            </p>

            <div style={{ maxHeight: '350px', overflowY: 'auto', marginBottom: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '8px' }}>Materia Prima</th>
                    <th style={{ padding: '8px', width: '100px' }}>Cantidad</th>
                    <th style={{ padding: '8px', width: '80px', textAlign: 'center' }}>Crítico</th>
                    <th style={{ padding: '8px', width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {materialesSeleccionados.map((item, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px' }}>
                        <select
                          value={item.referencia}
                          onChange={(e) => handleMaterialChange(index, 'referencia', e.target.value)}
                          style={{ width: '100%', padding: '5px' }}
                        >
                          <option value="">Seleccione...</option>
                          {materialesCatalogo.map(m => (
                            <option key={m.REFERENCIA} value={m.REFERENCIA}>
                              {m.ARTICULO} ({m.UNIDAD})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.cantidad}
                          onChange={(e) => handleMaterialChange(index, 'cantidad', e.target.value)}
                          style={{ width: '100%', padding: '5px' }}
                        />
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={item.es_critico !== false}
                          onChange={(e) => handleMaterialChange(index, 'es_critico', e.target.checked)}
                          title="Desmarcar si se puede entregar después"
                          style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button
                          onClick={() => removeMaterialRow(index)}
                          style={{
                            background: '#ef4444', color: 'white', border: 'none',
                            borderRadius: '4px', width: '24px', height: '24px', cursor: 'pointer'
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              className="pc-btn"
              style={{ background: '#f8fafc', color: '#64748b', border: '1px dashed #cbd5e1', width: '100%', marginBottom: '25px' }}
              onClick={addMaterialRow}
            >
              + Agregar otro insumo
            </button>

            <div className="cal-actions">
              <button
                className="cal-btn cancel"
                onClick={() => setShowMaterialModal(false)}
                disabled={materialesLoading}
              >
                Cancelar
              </button>
              <button
                className="cal-btn save"
                onClick={() => solicitarMateriasPrimas(true, true)}
                disabled={materialesLoading || materialesSeleccionados.every(m => !m.referencia)}
              >
                {materialesLoading ? "Enviando..." : "✔ Enviar solicitud"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
