import React, { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";
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
  });

  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");

  // ================================
  // Cargar áreas, tipos y prioridades
  // ================================
  useEffect(() => {
    async function loadData() {
      const { data: a } = await supabase.from("areas").select("*");
      const { data: t } = await supabase.from("tipos_solicitud").select("*");
      const { data: p } = await supabase.from("prioridades").select("*");

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

      // Reset tipo si cambió el área
      setForm((prev) => ({ ...prev, tipo_solicitud_id: "" }));
    }
  }, [form.area_id, tipos]);

  // ================================
  // Guardar solicitud
  // ================================
  async function enviarSolicitud() {
    if (!form.area_id || !form.tipo_solicitud_id || !form.prioridad_id || !form.descripcion) {
      return setMensaje("⚠️ Debes completar todos los campos obligatorios.");
    }

    setLoading(true);
    setMensaje("");

    // 1. Calcular Consecutivo para el Área destino
    let nextConsecutivo = 1;
    const { data: maxData, error: maxError } = await supabase
      .from("solicitudes")
      .select("consecutivo")
      .eq("area_id", form.area_id)
      .order("consecutivo", { ascending: false })
      .limit(1);

    if (!maxError && maxData.length > 0) {
      nextConsecutivo = (maxData[0].consecutivo || 0) + 1;
    }

    // 2. Insertar solicitud
    const { error } = await supabase.from("solicitudes").insert([
      {
        tipo_solicitud_id: form.tipo_solicitud_id,
        prioridad_id: form.prioridad_id,
        descripcion: form.descripcion,
        justificacion: form.justificacion,
        usuario_id: usuarioActual?.usuario,
        area_solicitante: usuarioActual?.areadetrabajo,
        estado_id: 1, // Pendiente
        area_id: form.area_id,
        consecutivo: nextConsecutivo, // <--- Guardamos el consecutivo calculado
      },
    ]);

    setLoading(false);

    if (error) {
      console.error(error);
      return setMensaje("❌ Error al enviar la solicitud.");
    }

    setMensaje("✅ Solicitud enviada correctamente.");
    console.log("DEBUG usuarioActual:", usuarioActual);


    // Reset formulario
    setForm({
      area_id: "",
      tipo_solicitud_id: "",
      prioridad_id: "",
      descripcion: "",
      justificacion: "",
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

          {/* Tipo de solicitud */}
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

          {/* Campos dinámicos según el tipo */}
          {form.tipo_solicitud_id && (
            <CamposDinamicos
              tipo={form.tipo_solicitud_id}
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
