import React, { useEffect, useState } from "react";
import { supabase, st } from "../../api/supabaseClient";

export default function CamposDinamicos({ tipo, areaId, form, setForm, isMantenimiento }) {
  const [activos, setActivos] = useState([]);

  useEffect(() => {
    // Cargar equipos si es área de Mantenimiento
    if (isMantenimiento || Number(tipo) === 2) {
      async function loadEquipos() {
        const { data } = await supabase.from(st("activos")).select("id, nombre, tipo, codigo").order("nombre");
        setActivos(data || []);
      }
      loadEquipos();
    }
  }, [tipo, areaId]);

  // Hierarchy para Mantenimiento
  if (isMantenimiento) {
    return (
        <div className="hierarchy-container" style={{ 
          marginTop: "15px", 
          padding: "20px", 
          background: "rgba(37, 99, 235, 0.03)", 
          borderRadius: "16px", 
          border: "1px solid rgba(37, 99, 235, 0.1)",
          display: "flex",
          flexDirection: "column",
          gap: "15px"
        }}>
          {/* 1. CATEGORÍA */}
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "700", fontSize: "0.85rem", color: "#1e40af" }}>
              1. ¿Qué desea reportar? *
            </label>
            <select
              value={form.maint_category || ""}
              onChange={(e) => setForm({ ...form, maint_category: e.target.value, activo_id: "", fecha_sugerida: "" })}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
            >
              <option value="">Seleccione categoría...</option>
              <option value="Equipo">Mantenimiento a Equipos de Producción</option>
              <option value="Instalación">Mantenimiento a Instalaciones</option>
              <option value="Computador">Mantenimiento a Equipos de Cómputo</option>
            </select>
          </div>

          {/* 2. TIPO (Preventivo, Correctivo, Mejora) */}
          {form.maint_category && (
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: "700", fontSize: "0.85rem", color: "#1e40af" }}>
                2. Tipo de Mantenimiento *
              </label>
              <select
                value={form.maint_type || ""}
                onChange={(e) => setForm({ ...form, maint_type: e.target.value })}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              >
                <option value="">Seleccione tipo...</option>
                <option value="Preventivo">Mantenimiento Preventivo</option>
                <option value="Correctivo">Mantenimiento Correctivo</option>
                <option value="Mejora">Mantenimiento de Mejora</option>
              </select>
            </div>
          )}

          {/* 3. EQUIPO / INSTALACIÓN (Dinámico por Categoría) */}
          {form.maint_category && form.maint_type && (
            <div className="dynamic-maint-fields" style={{ animation: "fadeIn 0.3s ease" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: "700", fontSize: "0.85rem", color: "#1e40af" }}>
                3. Vincular Equipo / Instalación Específica (Obligatorio) ⚙️
              </label>
              
              {form.maint_category === "Instalación" ? (
                <>
                  <input
                    type="text"
                    value={form.instalacion_desc || ""}
                    onChange={(e) => setForm({ ...form, instalacion_desc: e.target.value })}
                    placeholder="Escriba aquí la instalación o ubicación exacta..."
                    required
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  />
                  <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "5px" }}>
                    * Especifique el lugar físico donde se requiere el mantenimiento.
                  </p>
                </>
              ) : (
                <>
                  <select
                    value={form.activo_id || ""}
                    onChange={(e) => setForm({ ...form, activo_id: e.target.value })}
                    required
                    style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "white" }}
                  >
                    <option value="">Seleccione el equipo o computador...</option>
                    {activos
                      .filter((a) => a.tipo === form.maint_category)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre} {a.codigo ? `(${a.codigo})` : ""}
                        </option>
                      ))}
                  </select>
                  <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "5px" }}>
                    * Mostrando solo equipos de la categoría: {form.maint_category}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      );
  }

  // Otros tipos de solicitud estándar
  switch (Number(tipo)) {
    case 1:
      return <div>/* Campos especiales Control de Calidad (futuro) */</div>;

    case 3:
      return <div>/* Campos especiales Microbiología (futuro) */</div>;

    case 6:
      return <div>/* Campos especiales Compras (futuro) */</div>;

    default:
      return null;
  }
}
