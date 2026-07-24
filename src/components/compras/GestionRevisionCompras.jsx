import React, { useState, useEffect } from "react";
import { supabase } from "../../api/supabaseClient";

export default function GestionRevisionCompras({ solicitud, onAprobar, onRechazar, errorG }) {
  const [proveedores, setProveedores] = useState([]);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState("");
  const [nuevaRazonSocial, setNuevaRazonSocial] = useState("");
  const [nuevoNit, setNuevoNit] = useState("");

  const [cotizaciones, setCotizaciones] = useState([{ total: "", fecha_entrega_estimada: "", condiciones_pago: "", url_archivo: "", observaciones: "" }]);
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [archivosPrevios, setArchivosPrevios] = useState([]);

  useEffect(() => {
    async function loadProveedoresAndFiles() {
      const { data } = await supabase.from("compras_proveedores").select("*").order("razon_social");
      if (data) setProveedores(data);

      if (solicitud?.id) {
        const { data: adjData } = await supabase
          .from("compras_adjuntos")
          .select("*")
          .eq("solicitud_id", solicitud.id)
          .eq("tipo", "COTIZACION_PREVIA");
        if (adjData) setArchivosPrevios(adjData);
      }
    }
    loadProveedoresAndFiles();
  }, [solicitud]);

  const handleAddCotizacion = () => {
    if (cotizaciones.length >= 3) {
      setLocalError("Máximo 3 cotizaciones permitidas.");
      return;
    }
    setCotizaciones([...cotizaciones, { total: "", fecha_entrega_estimada: "", condiciones_pago: "", url_archivo: "", observaciones: "" }]);
  };

  const updateCotizacion = (index, field, value) => {
    const newCot = [...cotizaciones];
    newCot[index][field] = value;
    setCotizaciones(newCot);
  };

  const removeCotizacion = (index) => {
    setCotizaciones(cotizaciones.filter((_, i) => i !== index));
  };

  const handleAprobar = async () => {
    setLocalError("");
    if (!proveedorSeleccionado && (!nuevoNit || !nuevaRazonSocial)) {
      setLocalError("Debes seleccionar o crear un proveedor.");
      return;
    }

    const hasValidCotizacion = cotizaciones.some(c => Number(c.total) > 0);
    if (!hasValidCotizacion) {
      setLocalError("Debes ingresar al menos una cotización con valor válido.");
      return;
    }

    setLoading(true);

    let finalProvId = proveedorSeleccionado;
    if (proveedorSeleccionado === "NUEVO") {
      const { data: pData, error: pErr } = await supabase.from("compras_proveedores").insert([{
        nit_cedula: nuevoNit,
        razon_social: nuevaRazonSocial
      }]).select();

      if (pErr) {
        setLocalError("Error creando proveedor: " + pErr.message);
        setLoading(false);
        return;
      }
      finalProvId = pData[0].id;
    }

    // Insertar cotizaciones
    const validCots = cotizaciones.filter(c => Number(c.total) > 0).map((c, i) => ({
      solicitud_id: solicitud.id,
      proveedor_id: finalProvId,
      total: Number(c.total),
      fecha_compromiso_entrega: c.fecha_entrega_estimada || null,
      condiciones_pago: c.condiciones_pago || null,
      // es_seleccionada: i === 0,  <-- we don't have this column in DB, we use cotizacion_seleccionada_id on detalle
      // We will leave the selection logic simple for now or update it in another query
    }));

    let primeraCotizacionId = null;
    if (validCots.length > 0) {
      const { data: cData, error: cErr } = await supabase.from("compras_cotizaciones").insert(validCots).select();
      if (cErr) {
        setLocalError("Error guardando cotizaciones: " + cErr.message);
        setLoading(false);
        return;
      }
      if (cData && cData.length > 0) {
        primeraCotizacionId = cData[0].id;
      }
    }

    // Actualizar estado compra a 'EN_APROBACION_GERENCIA'
    const updateDetalle = { estado_compra: "EN_APROBACION_GERENCIA" };
    if (primeraCotizacionId) {
      updateDetalle.cotizacion_seleccionada_id = primeraCotizacionId;
    }

    await supabase.from("compras_solicitudes_detalle")
      .update(updateDetalle)
      .eq("solicitud_id", solicitud.id);

    setLoading(false);
    onAprobar(comentario);
  };

  return (
    <div className="action-area" style={{ background: "#f8fafc", padding: "15px", borderRadius: "8px", marginTop: "15px" }}>
      <h4 style={{ color: "#334155", marginBottom: "15px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>Gestión de Proveedor y Cotizaciones</h4>
      
      {archivosPrevios.length > 0 && (
        <div style={{ marginBottom: "20px", padding: "12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px" }}>
          <h5 style={{ color: "#166534", marginBottom: "8px", fontWeight: "600", fontSize: "0.85rem" }}>Soportes subidos por el Solicitante:</h5>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {archivosPrevios.map((file, idx) => (
              <li key={file.id}>
                <a 
                  href={file.path} 
                  target="_blank" 
                  rel="noreferrer" 
                  style={{ display: "inline-block", padding: "6px 12px", background: "#10b981", color: "#fff", textDecoration: "none", borderRadius: "6px", fontSize: "0.75rem", fontWeight: "500" }}
                >
                  📄 Abrir Soporte {idx + 1}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginBottom: "15px" }}>
        <label style={{ display: "block", marginBottom: "5px", fontWeight: "600", fontSize: "0.85rem", color: "#475569" }}>Proveedor Recomendado *</label>
        <select value={proveedorSeleccionado} onChange={(e) => setProveedorSeleccionado(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", marginBottom: "10px" }}>
          <option value="">Seleccione proveedor...</option>
          <option value="NUEVO">+ Crear Nuevo Proveedor</option>
          {proveedores.map(p => (
            <option key={p.id} value={p.id}>{p.razon_social} ({p.nit_cedula})</option>
          ))}
        </select>
        
        {proveedorSeleccionado === "NUEVO" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px", background: "#f1f5f9", padding: "10px", borderRadius: "6px" }}>
            <input type="text" placeholder="NIT / Cédula" value={nuevoNit} onChange={e => setNuevoNit(e.target.value)} style={{ padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e1" }} />
            <input type="text" placeholder="Razón Social" value={nuevaRazonSocial} onChange={e => setNuevaRazonSocial(e.target.value)} style={{ padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e1" }} />
          </div>
        )}
      </div>

      <div style={{ marginBottom: "15px" }}>
        <label style={{ display: "block", marginBottom: "10px", fontWeight: "600", fontSize: "0.85rem", color: "#475569" }}>Cotizaciones (Máx 3) *</label>
        {cotizaciones.map((cot, idx) => (
          <div key={idx} style={{ background: "#fff", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0", marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: "bold", color: "#64748b" }}>Opción {idx + 1} {idx === 0 ? "(Recomendada)" : ""}</span>
              {cotizaciones.length > 1 && <button onClick={() => removeCotizacion(idx)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "0.75rem" }}>Eliminar</button>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "0.7rem", color: "#64748b" }}>Valor Total ($) *</label>
                <input type="number" value={cot.total} onChange={e => updateCotizacion(idx, "total", e.target.value)} style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1" }} />
              </div>
              <div>
                <label style={{ fontSize: "0.7rem", color: "#64748b" }}>Fecha Entrega Est.</label>
                <input type="date" value={cot.fecha_entrega_estimada} onChange={e => updateCotizacion(idx, "fecha_entrega_estimada", e.target.value)} style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1" }} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: "0.7rem", color: "#64748b" }}>Condiciones de Pago</label>
                <input type="text" placeholder="Ej: 30 días, Contado..." value={cot.condiciones_pago} onChange={e => updateCotizacion(idx, "condiciones_pago", e.target.value)} style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1" }} />
              </div>
            </div>
          </div>
        ))}
        {cotizaciones.length < 3 && (
          <button onClick={handleAddCotizacion} style={{ background: "#e2e8f0", color: "#475569", border: "none", borderRadius: "4px", padding: "6px 12px", cursor: "pointer", fontSize: "0.75rem", width: "100%" }}>+ Añadir cotización comparativa</button>
        )}
      </div>

      <div style={{ marginBottom: "15px" }}>
        <label style={{ display: "block", marginBottom: "5px", fontWeight: "600", fontSize: "0.85rem", color: "#475569" }}>Comentarios / Justificación (Opcional)</label>
        <textarea className="comp-textarea" style={{ width: "100%", minHeight: "60px", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
          placeholder="Justificación de la elección del proveedor o comentarios adicionales..."
          value={comentario}
          onChange={e => setComentario(e.target.value)}
        />
      </div>

      {(localError || errorG) && <p className="error-msg" style={{ color: "#ef4444", fontSize: "0.85rem", marginBottom: "10px" }}>{localError || errorG}</p>}
      
      <div className="modal-footer-actions" style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
        <button className="btn-reject" onClick={() => onRechazar(comentario)} disabled={loading} style={{ flex: 1, padding: "10px", background: "#ef4444", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>
          Solicitar Corrección
        </button>
        <button className="btn-approve" onClick={handleAprobar} disabled={loading} style={{ flex: 2, padding: "10px", background: "#10b981", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>
          {loading ? "Procesando..." : "Aprobar (Enviar a Gerencia)"}
        </button>
      </div>
    </div>
  );
}
