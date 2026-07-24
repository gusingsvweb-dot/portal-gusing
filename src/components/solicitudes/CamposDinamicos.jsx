import React, { useEffect, useState } from "react";
import { supabase, st } from "../../api/supabaseClient";

export default function CamposDinamicos({ tipo, areaId, form, setForm, isMantenimiento, isCompras }) {
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

  // Hierarchy para Compras
  if (isCompras) {
    const handleItemChange = (index, field, value) => {
      const newItems = [...form.compras_items];
      newItems[index][field] = value;
      setForm({ ...form, compras_items: newItems });
    };

    const addItem = () => {
      setForm({
        ...form,
        compras_items: [
          ...form.compras_items,
          { referencia: "", descripcion: "", cantidad_solicitada: "", unidad_medida: "UNIDAD", equipo_identificacion_interna: "", observaciones: "" }
        ]
      });
    };

    const removeItem = (index) => {
      const newItems = form.compras_items.filter((_, i) => i !== index);
      setForm({ ...form, compras_items: newItems });
    };

    return (
      <div className="hierarchy-container" style={{ 
        marginTop: "15px", 
        padding: "20px", 
        background: "rgba(16, 185, 129, 0.03)", 
        borderRadius: "16px", 
        border: "1px solid rgba(16, 185, 129, 0.2)",
        display: "flex",
        flexDirection: "column",
        gap: "15px"
      }}>
        <div>
          <label style={{ display: "block", marginBottom: "6px", fontWeight: "700", fontSize: "0.85rem", color: "#047857" }}>
            1. Tipo de Requisición *
          </label>
          <select
            value={form.compras_tipo_requisicion || ""}
            onChange={(e) => setForm({ ...form, compras_tipo_requisicion: e.target.value })}
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "var(--bg-card, #fff)", color: "var(--text-color, #333)" }}
          >
            <option value="">Seleccione...</option>
            <option value="MATERIAL">Material / Producto</option>
            <option value="EQUIPO">Equipo</option>
            <option value="SERVICIO">Servicio</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "6px", fontWeight: "700", fontSize: "0.85rem", color: "#047857" }}>
            2. Categoría de la Compra *
          </label>
          <select
            value={form.compras_categoria || ""}
            onChange={(e) => setForm({ ...form, compras_categoria: e.target.value })}
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "var(--bg-card, #fff)", color: "var(--text-color, #333)" }}
          >
            <option value="">Seleccione...</option>
            <option value="MATERIA_PRIMA">Materia Prima</option>
            <option value="INSUMO">Insumo</option>
            <option value="MATERIAL_IMPRESO">Material Impreso</option>
            <option value="EQUIPO">Equipo</option>
            <option value="SERVICIO">Servicio</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>

        <div style={{ marginTop: "10px" }}>
          <label style={{ display: "block", marginBottom: "10px", fontWeight: "700", fontSize: "0.85rem", color: "#047857" }}>
            3. Ítems a Comprar *
          </label>
          {form.compras_items.map((item, index) => (
            <div key={index} style={{ background: "var(--bg-card, #fff)", padding: "15px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                <strong style={{ color: "var(--text-color, #333)" }}>Ítem {index + 1}</strong>
                {form.compras_items.length > 1 && (
                  <button type="button" onClick={() => removeItem(index)} style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", padding: "2px 8px", cursor: "pointer", fontSize: "0.75rem" }}>
                    Eliminar
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-color, #333)" }}>Referencia</label>
                  <input type="text" value={item.referencia} onChange={(e) => handleItemChange(index, "referencia", e.target.value)} style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "var(--bg-card, #fff)", color: "var(--text-color, #333)" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-color, #333)" }}>Descripción *</label>
                  <input type="text" value={item.descripcion} onChange={(e) => handleItemChange(index, "descripcion", e.target.value)} style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "var(--bg-card, #fff)", color: "var(--text-color, #333)" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-color, #333)" }}>Cantidad *</label>
                  <input type="number" min="0.1" step="any" value={item.cantidad_solicitada} onChange={(e) => handleItemChange(index, "cantidad_solicitada", e.target.value)} style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "var(--bg-card, #fff)", color: "var(--text-color, #333)" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-color, #333)" }}>Unidad</label>
                  <input type="text" value={item.unidad_medida} onChange={(e) => handleItemChange(index, "unidad_medida", e.target.value)} style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "var(--bg-card, #fff)", color: "var(--text-color, #333)" }} />
                </div>
                {form.compras_tipo_requisicion === "SERVICIO" && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: "0.75rem", color: "var(--text-color, #333)" }}>Equipo al que aplica el servicio</label>
                    <input type="text" value={item.equipo_identificacion_interna} onChange={(e) => handleItemChange(index, "equipo_identificacion_interna", e.target.value)} placeholder="Ej: Maquina de mezclado M1" style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "var(--bg-card, #fff)", color: "var(--text-color, #333)" }} />
                  </div>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={addItem} style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 12px", cursor: "pointer", fontSize: "0.8rem", width: "100%" }}>
            + Añadir otro ítem
          </button>
        </div>

        <div style={{ marginTop: "10px" }}>
          <label style={{ display: "block", marginBottom: "6px", fontWeight: "700", fontSize: "0.85rem", color: "#047857" }}>
            4. Cotizaciones Adjuntas (Opcional)
          </label>
          <p style={{ fontSize: "0.75rem", color: "var(--text-color, #64748b)", marginBottom: "8px" }}>Sube hasta 3 soportes de cotización (PDF o Imagen).</p>
          <input 
            type="file" 
            multiple 
            accept=".pdf,.png,.jpg,.jpeg" 
            onChange={(e) => {
              const files = Array.from(e.target.files).slice(0, 3);
              setForm({ ...form, compras_archivos: files });
            }}
            style={{ 
              width: "100%", padding: "10px", borderRadius: "8px", 
              border: "1px dashed #10b981", background: "var(--bg-card, #fff)", color: "var(--text-color, #333)" 
            }}
          />
          {form.compras_archivos && form.compras_archivos.length > 0 && (
            <ul style={{ fontSize: "0.75rem", marginTop: "10px", color: "var(--text-color, #333)" }}>
              {Array.from(form.compras_archivos).map((file, idx) => (
                <li key={idx}>📄 {file.name}</li>
              ))}
            </ul>
          )}
        </div>
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
