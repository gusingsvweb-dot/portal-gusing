import React, { useEffect, useState } from "react";
import { supabase, st, ss } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./CrearSolicitud.css";
import { useAuth } from "../context/AuthContext";
import CamposDinamicos from "../components/solicitudes/CamposDinamicos";

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
    justificacion: "",
    activo_id: "", 
    maint_category: "", // Nuevo para jerarquía
    maint_type: "",      // Nuevo para jerarquía
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
    // Validación obligatoria de jerarquía para Mantenimiento (Area ID 1)
    if (Number(form.area_id) === 1) {
      if (!form.maint_category || !form.maint_type || !form.activo_id) {
        return setMensaje("⚠️ Para mantenimiento debes seleccionar Categoría, Tipo y Activo.");
      }
    } else if (!form.tipo_solicitud_id) {
      // Para otras áreas, el tipo estándar es obligatorio
      return setMensaje("⚠️ Debes seleccionar el tipo de solicitud.");
    }

    if (!form.prioridad_id || !form.descripcion) {
      return setMensaje("⚠️ Debes completar todos los campos obligatorios.");
    }

    setLoading(true);
    setMensaje("");

    // 1. Calcular Consecutivo para el Área destino
    let nextConsecutivo = 1;
    const { data: maxData, error: maxError } = await supabase
      .from(st("solicitudes"))
      .select(ss("consecutivo"))
      .eq("area_id", form.area_id)
      .order("consecutivo", { ascending: false })
      .limit(1);

    if (!maxError && maxData.length > 0) {
      nextConsecutivo = (maxData[0].consecutivo || 0) + 1;
    }

    // 2. Determinar tipo_solicitud_id final
    let finalTipoId = form.tipo_solicitud_id;
    let finalDesc = form.descripcion;

    if (Number(form.area_id) === 1) {
      // Mapear maint_type al ID real en la tabla tipos_solicitud
      const mapped = tiposFiltrados.find(t => t.nombre.toLowerCase().includes(form.maint_type.toLowerCase()));
      if (mapped) finalTipoId = mapped.id;
      
      // Enriquecer descripción
      finalDesc = `[${form.maint_category.toUpperCase()} - ${form.maint_type.toUpperCase()}] \n${form.descripcion}`;
    }

    // 3. Insertar solicitud
    const { error } = await supabase.from(st("solicitudes")).insert([
      {
        tipo_solicitud_id: finalTipoId,
        prioridad_id: form.prioridad_id,
        descripcion: finalDesc,
        justificacion: form.justificacion,
        usuario_id: usuarioActual?.usuario,
        area_solicitante: usuarioActual?.areadetrabajo,
        estado_id: 1, // Pendiente
        area_id: form.area_id,
        consecutivo: nextConsecutivo,
        activo_id: form.activo_id || null, 
      },
    ]);

    setLoading(false);

    if (error) {
      console.error(error);
      return setMensaje("❌ Error al enviar la solicitud.");
    }

    setMensaje("✅ Solicitud enviada correctamente.");
    
    // Reset formulario
    setForm({
      area_id: "",
      tipo_solicitud_id: "",
      prioridad_id: "",
      descripcion: "",
      justificacion: "",
      activo_id: "",
    });
  }

  return (
    <>
      <Navbar />

      <div className="crear-wrapper">
        <h2>📝 Crear Nueva Solicitud</h2>
        <p className="crear-sub">
          Completa la información para generar una solicitud al área correspondiente.
        </p>

        <div className="crear-card">

          {/* Área */}
          <label>Área a solicitar *</label>
          <select
            value={form.area_id}
            onChange={(e) => setForm({ ...form, area_id: e.target.value })}
          >
            <option value="">Seleccione...</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>

          {/* Tipo de solicitud (OCULTO para Mantenimiento) */}
          {Number(form.area_id) !== 1 && (
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

          {/* Prioridad */}
          <label>Prioridad *</label>
          <select
            value={form.prioridad_id}
            onChange={(e) =>
              setForm({ ...form, prioridad_id: e.target.value })
            }
          >
            <option value="">Seleccione...</option>
            {prioridades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>

          {/* Campos dinámicos según el área/tipo */}
          {(form.tipo_solicitud_id || Number(form.area_id) === 1) && (
            <CamposDinamicos
              tipo={form.tipo_solicitud_id}
              areaId={form.area_id}
              form={form}
              setForm={setForm}
            />
          )}

          {/* Descripción */}
          <label>Descripción general *</label>
          <textarea
            rows="3"
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          />

          {/* Justificación */}
          <label>Justificación (opcional)</label>
          <textarea
            rows="2"
            value={form.justificacion}
            onChange={(e) =>
              setForm({ ...form, justificacion: e.target.value })
            }
          />

          {mensaje && <p className="crear-msg">{mensaje}</p>}

          <button className="crear-btn" onClick={enviarSolicitud} disabled={loading}>
            {loading ? "Enviando..." : "Enviar Solicitud"}
          </button>
        </div>
      </div>

      <Footer />
    </>
  );
}
