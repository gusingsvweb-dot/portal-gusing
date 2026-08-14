import React, { useEffect, useState } from "react";
import { supabase, st, ss } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./CrearSolicitud.css";
import { useAuth } from "../context/AuthContext";
import CamposDinamicos from "../components/solicitudes/CamposDinamicos";
import { notifyRoles } from "../api/notifications";

export default function CrearSolicitud() {
  const { usuarioActual } = useAuth();

  const [areas, setAreas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [tiposFiltrados, setTiposFiltrados] = useState([]);
  const [prioridades, setPrioridades] = useState([]);

  const [form, setForm] = useState({
    area_id: "",
    tipo_solicitud_id: "",
    prioridad_id: "",
    descripcion: "",
    activo_id: "", 
    maint_category: "", // Nuevo para jerarquía
    maint_type: "",      // Nuevo para jerarquía
    instalacion_desc: "", // Input libre para instalaciones
    compras_tipo_requisicion: "",
    compras_categoria: "",
    compras_items: [{ referencia: "", descripcion: "", cantidad_solicitada: "", unidad_medida: "UNIDAD", equipo_identificacion_interna: "", observaciones: "" }],
  });

  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");

  // ================================
  // Cargar áreas, tipos y prioridades
  // ================================
  useEffect(() => {
    async function loadData() {
      const { data: a } = await supabase.from(st("areas")).select(ss("*"));
      const { data: t } = await supabase.from(st("tipos_solicitud")).select(ss("*"));
      const { data: p } = await supabase.from(st("prioridades")).select(ss("*"));

      setAreas(a || []);
      setTipos(t || []);
      setPrioridades(p || []);
    }

    loadData();
  }, []);

  // ================================
  // Cuando cambia el área → filtrar tipos correspondientes
  // ================================
  useEffect(() => {
    if (form.area_id) {
      const filtrados = tipos.filter(
        (t) => t.id_area_relacionada === Number(form.area_id)
      );
      setTiposFiltrados(filtrados);

      // Reset campos si cambió el área
      setForm((prev) => ({ ...prev, tipo_solicitud_id: "", activo_id: "" }));
    }
  }, [form.area_id, tipos]);

  // ================================
  // Guardar solicitud
  // ================================
  async function enviarSolicitud() {
    const areaSeleccionada = areas.find(a => String(a.id) === String(form.area_id));
    const isMantenimiento = areaSeleccionada?.nombre?.toLowerCase().trim() === "mantenimiento";

    // Validación obligatoria de jerarquía para Mantenimiento
    if (isMantenimiento) {
      if (!form.maint_category || !form.maint_type) {
        return setMensaje("⚠️ Para mantenimiento debes seleccionar Categoría y Tipo.");
      }
      if (form.maint_category !== "Instalación" && !form.activo_id) {
        return setMensaje("⚠️ Debes seleccionar el equipo a vincular.");
      }
      if (form.maint_category === "Instalación" && !form.instalacion_desc.trim()) {
        return setMensaje("⚠️ Debes escribir la instalación o lugar a intervenir.");
      }
    } else if (areaSeleccionada?.nombre?.toLowerCase().trim() === "compras") {
      if (!form.compras_tipo_requisicion) {
        return setMensaje("⚠️ Para compras debes seleccionar el Tipo de Requisición.");
      }
      const hasValidItems = form.compras_items.some(i => i.descripcion && Number(i.cantidad_solicitada) > 0);
      if (!hasValidItems) {
        return setMensaje("⚠️ Debes agregar al menos un ítem válido con descripción y cantidad mayor a 0.");
      }
    } else if (!form.tipo_solicitud_id) {
      // Para otras áreas, el tipo estándar es obligatorio
      return setMensaje("⚠️ Debes seleccionar el tipo de solicitud.");
    }

    if (!isComprasRender && !form.prioridad_id) {
      return setMensaje("⚠️ Debes seleccionar una prioridad.");
    }

    if (!isComprasRender && !form.descripcion) {
      return setMensaje("⚠️ Debes agregar una descripción general obligatoria.");
    }

    setLoading(true);
    setMensaje("");

    // 1. Calcular Consecutivo para el Área destino (excepto Compras, que lo asigna Calidad)
    let nextConsecutivo = null;
    
    if (!isComprasRender) {
      nextConsecutivo = 1;
      const { data: maxData, error: maxError } = await supabase
        .from(st("solicitudes"))
        .select(ss("consecutivo"))
        .eq("area_id", form.area_id)
        .order("consecutivo", { ascending: false })
        .limit(1);

      if (!maxError && maxData.length > 0) {
        nextConsecutivo = (maxData[0].consecutivo || 0) + 1;
      }
    }

    // 2. Determinar tipo_solicitud_id final
    let finalTipoId = form.tipo_solicitud_id;
    let finalDesc = form.descripcion;

    if (isMantenimiento) {
      // Mapear maint_type al ID real en la tabla tipos_solicitud
      const mapped = tiposFiltrados.find(t => t.nombre.toLowerCase().includes(form.maint_type.toLowerCase()));
      if (mapped) finalTipoId = mapped.id;
      
      // Enriquecer descripción
      const extraInst = form.maint_category === "Instalación" ? `\n[INSTALACIÓN: ${form.instalacion_desc}]` : "";
      finalDesc = `[${form.maint_category.toUpperCase()} - ${form.maint_type.toUpperCase()}]${extraInst}\n${form.descripcion}`;
    } else if (isComprasRender) {
      if (tiposFiltrados.length > 0) {
        finalTipoId = tiposFiltrados[0].id;
      }
      finalDesc = form.compras_items.length > 0 
        ? `Solicitud de Compras: ${form.compras_items[0].descripcion}` 
        : "Solicitud de Compras";
    }

    // 3. Insertar solicitud
    const { data: insertedData, error: insertError } = await supabase.from(st("solicitudes")).insert([
      {
        tipo_solicitud_id: finalTipoId || null,
        prioridad_id: form.prioridad_id || null,
        descripcion: finalDesc,
        justificacion: "N/A",
        usuario_id: usuarioActual?.usuario,
        area_solicitante: usuarioActual?.areadetrabajo,
        estado_id: 1, // Pendiente
        area_id: form.area_id,
        consecutivo: nextConsecutivo,
        activo_id: form.activo_id || null, 
      },
    ]).select();

    if (insertError) {
      setLoading(false);
      console.error("Error detallado Supabase:", insertError);
      return setMensaje(`❌ Error de Base de Datos: ${insertError.message} (Código: ${insertError.code})`);
    }

    const newSolicitudId = insertedData?.[0]?.id;

    // 4. Si es Compras, insertar detalle e ítems
    if (areaSeleccionada?.nombre?.toLowerCase().trim() === "compras" && newSolicitudId) {
      const { error: errorDetalle } = await supabase.from("compras_solicitudes_detalle").insert([{
        solicitud_id: newSolicitudId,
        tipo_requisicion: form.compras_tipo_requisicion,
        categoria_compra: form.compras_categoria || null,
        estado_compra: "PENDIENTE",
        cargo_solicitante_snapshot: usuarioActual?.cargo || "N/A",
        proceso_solicitante_snapshot: usuarioActual?.areadetrabajo || "N/A",
        observaciones_requerimiento: form.compras_observaciones || null
      }]);

      if (errorDetalle) {
        console.error("Error guardando detalle compras:", errorDetalle);
        return setMensaje(`❌ Error guardando detalle de compras: ${errorDetalle.message}`);
      } else {
        const itemsToInsert = form.compras_items
          .filter(i => i.descripcion && Number(i.cantidad_solicitada) > 0)
          .map((i, idx) => ({
            solicitud_id: newSolicitudId,
            orden: idx + 1,
            descripcion: i.descripcion,
            stock_actual: Number(i.stock_actual) || 0,
            equipo_identificacion_interna: i.equipo_identificacion_interna || null,
            cantidad_solicitada: Number(i.cantidad_solicitada),
            unidad_medida: i.unidad_medida || 'UNIDAD',
            observaciones: i.observaciones || null
          }));
        
        if (itemsToInsert.length > 0) {
          const { error: itemsError } = await supabase.from("compras_solicitud_items").insert(itemsToInsert);
          if (itemsError) {
            console.error("Error guardando items compras:", itemsError);
            return setMensaje(`❌ Error guardando ítems de compras: ${itemsError.message}`);
          }
        }

        // Subir cotizaciones adjuntas si existen
        if (form.compras_archivos && form.compras_archivos.length > 0) {
          for (const file of form.compras_archivos) {
            const fileName = `${newSolicitudId}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const { error: uploadError } = await supabase.storage
              .from("compras_adjuntos")
              .upload(`cotizaciones/${fileName}`, file, { cacheControl: '3600', upsert: false });
            
            if (!uploadError) {
              const { data: publicUrlData } = supabase.storage
                .from("compras_adjuntos")
                .getPublicUrl(`cotizaciones/${fileName}`);
                
              const { error: adjError } = await supabase.from("compras_adjuntos").insert([{
                solicitud_id: newSolicitudId,
                tipo: 'COTIZACION_PREVIA',
                path: publicUrlData.publicUrl,
                nombre: file.name,
                mime_type: file.type,
                tamano: file.size
              }]);
              if (adjError) {
                console.error("Error guardando adjuntos compras:", adjError);
                return setMensaje(`❌ Error guardando adjuntos de compras: ${adjError.message}`);
              }
            } else {
              console.error("Error subiendo archivo:", uploadError);
            }
          }
        }
      }
    }

    setLoading(false);
    setMensaje("✅ Solicitud enviada correctamente.");

    // Enviar Notificación al Área Destino
    try {
      const areaDestino = areas.find((a) => String(a.id) === String(form.area_id));
      const areaNombre = areaDestino ? areaDestino.nombre : "mantenimiento";
      
      const prioridadNombre = prioridades.find(p => String(p.id) === String(form.prioridad_id))?.nombre || "";
      const resumen = finalDesc.length > 80 ? finalDesc.substring(0, 80) + "…" : finalDesc;
      const prefix = areaNombre.charAt(0).toUpperCase();
      await notifyRoles(
        [areaNombre, "gerencia"],
        `🔔 Nueva Solicitud${prioridadNombre ? ` — Prioridad ${prioridadNombre}` : ""}`,
        `${usuarioActual?.usuario || "Sistema"} (${usuarioActual?.areadetrabajo || "—"}) creó la solicitud ${prefix}-${nextConsecutivo}: "${resumen}"`,
        null,
        "info"
      );
    } catch (notifErr) {
      console.error("No se pudo enviar la notificación: ", notifErr);
    }
    
    // Reset formulario
    setForm({
      area_id: "",
      tipo_solicitud_id: "",
      prioridad_id: "",
      descripcion: "",
      activo_id: "",
      instalacion_desc: "",
      compras_tipo_requisicion: "",
      compras_categoria: "",
      compras_items: [{ descripcion: "", stock_actual: "", cantidad_solicitada: "", unidad_medida: "UNIDAD", equipo_identificacion_interna: "", observaciones: "" }],
      compras_archivos: [],
      compras_observaciones: ""
    });
  }

  const areaSeleccionadaRender = areas.find(a => String(a.id) === String(form.area_id));
  const isMantenimientoRender = areaSeleccionadaRender?.nombre?.toLowerCase().trim() === "mantenimiento";
  const isComprasRender = areaSeleccionadaRender?.nombre?.toLowerCase().trim() === "compras";

  return (
    <>
      <Navbar />

      <div className="crear-wrapper">
        <div className="crear-header-container">
          <h2>📝 Crear Nueva Solicitud</h2>
          <p className="crear-sub">
            Completa la información para generar una solicitud al área correspondiente.
          </p>
        </div>

        <div className="crear-card">

          {/* Área */}
          <label>Área a solicitar *</label>
          <select
            value={form.area_id}
            onChange={(e) => setForm({ ...form, area_id: e.target.value })}
          >
            <option value="">Seleccione...</option>
            {areas
              .filter((a) => ["mantenimiento", "compras"].includes(a.nombre.toLowerCase().trim()))
              .map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>

          {/* Tipo de solicitud (OCULTO para Mantenimiento y Compras) */}
          {!isMantenimientoRender && !isComprasRender && (
            <>
              <label>Tipo de solicitud *</label>
              <select
                value={form.tipo_solicitud_id}
                onChange={(e) =>
                  setForm({ ...form, tipo_solicitud_id: e.target.value })
                }
                disabled={!form.area_id}
              >
                <option value="">
                  {form.area_id ? "Seleccione..." : "Primero seleccione un área"}
                </option>
                {tiposFiltrados.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </>
          )}

          {/* Prioridad (Oculto para Compras) */}
          {!isComprasRender && (
            <>
              <label>Prioridad *</label>
              <select
                value={form.prioridad_id}
                onChange={(e) =>
                  setForm({ ...form, prioridad_id: e.target.value })
                }
              >
                <option value="">Seleccione...</option>
                {prioridades
                  .filter(p => {
                    // Si es mantenimiento, solo Bajo, Medio y Alto
                    if (isMantenimientoRender) {
                      return !["Muy Alto", "Critica", "Urgente"].includes(p.nombre);
                    }
                    return true;
                  })
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
              </select>
            </>
          )}

          {/* Campos dinámicos según el área/tipo */}
          {(form.tipo_solicitud_id || isMantenimientoRender || isComprasRender) && (
            <CamposDinamicos
              tipo={form.tipo_solicitud_id}
              areaId={form.area_id}
              form={form}
              setForm={setForm}
              isMantenimiento={isMantenimientoRender}
              isCompras={isComprasRender}
            />
          )}

          {/* Descripción */}
          {!isComprasRender && (
            <>
              <label>Descripción general *</label>
              <textarea
                rows="5"
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Describe el problema o necesidad detalladamente..."
              />
            </>
          )}

          {mensaje && (
            <p className="crear-msg" data-type={mensaje.includes("✅") ? "success" : "error"}>
              {mensaje}
            </p>
          )}

          <button className="crear-btn" onClick={enviarSolicitud} disabled={loading}>
            {loading ? "Enviando..." : "Enviar Solicitud"}
          </button>
        </div>
      </div>

      <Footer />
    </>
  );
}
