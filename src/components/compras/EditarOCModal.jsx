import React, { useState, useEffect } from "react";
import { supabase } from "../../api/supabaseClient";

export default function EditarOCModal({ oc, cotizacion, onClose, onSaved }) {
  const [subtotal, setSubtotal] = useState(oc?.subtotal ?? cotizacion?.subtotal ?? cotizacion?.total ?? 0);
  const [descuento, setDescuento] = useState(oc?.descuento_valor ?? 0);
  const [iva, setIva] = useState(oc?.iva_valor ?? 0);
  const [retefuente, setRetefuente] = useState(oc?.retefuente_valor ?? 0);
  const [observaciones, setObservaciones] = useState(oc?.observaciones ?? cotizacion?.observaciones ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalFactura = Number(subtotal) - Number(descuento);
  const totalNeto = totalFactura + Number(iva) - Number(retefuente);

  const handleSave = async () => {
    setLoading(true);
    setError("");
    const { error: updErr } = await supabase
      .from("compras_ordenes_compra")
      .update({
        subtotal: Number(subtotal),
        descuento_valor: Number(descuento),
        iva_valor: Number(iva),
        retefuente_valor: Number(retefuente),
        total_neto: totalNeto,
        observaciones: observaciones
      })
      .eq("id", oc.id);

    if (updErr) {
      setError(`Error guardando: ${updErr.message}`);
      setLoading(false);
    } else {
      setLoading(false);
      onSaved();
    }
  };

  return (
    <div className="comp-modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="comp-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <button className="close-btn" onClick={onClose}>✖</button>
        <div className="modal-header">
          <h3>Editar Valores OC: {oc?.numero_oc}</h3>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Subtotal</label>
            <input type="number" value={subtotal} onChange={e => setSubtotal(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Descuento</label>
            <input type="number" value={descuento} onChange={e => setDescuento(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Total Factura (Autocalculado)</label>
            <input type="number" value={totalFactura} disabled style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#f1f5f9' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>IVA</label>
            <input type="number" value={iva} onChange={e => setIva(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Retefuente</label>
            <input type="number" value={retefuente} onChange={e => setRetefuente(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Total Neto (Autocalculado)</label>
            <input type="number" value={totalNeto} disabled style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#f1f5f9' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Anotaciones / Observaciones</label>
            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows="3" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
          </div>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: '#ccc', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleSave} disabled={loading} style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer' }}>
              {loading ? 'Guardando...' : 'Guardar y Cerrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
