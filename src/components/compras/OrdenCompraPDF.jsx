import React, { useEffect, useState } from "react";
import { supabase, st, ss } from "../../api/supabaseClient";
import "./OrdenCompraPDF.css";

export default function OrdenCompraPDF({ solicitudId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editValues, setEditValues] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const { data: sol, error: errSol } = await supabase
          .from(st("solicitudes"))
          .select(ss(`
            *,
            compras_solicitudes_detalle ( * ),
            compras_solicitud_items ( * ),
            compras_ordenes_compra ( * ),
            compras_cotizaciones (
              *,
              compras_proveedores ( * )
            )
          `))
          .eq("id", solicitudId)
          .single();

        if (errSol) throw errSol;

        const oc = sol.compras_ordenes_compra?.[0];
        const detalle = sol.compras_solicitudes_detalle?.[0];
        const items = sol.compras_solicitud_items || [];
        
        // La cotización que está en la OC o la seleccionada en detalle
        const cotId = oc?.cotizacion_id || detalle?.cotizacion_seleccionada_id;
        const cotizacion = sol.compras_cotizaciones?.find(c => c.id === cotId);
        const proveedor = cotizacion?.compras_proveedores;
        
        const provSnapshot = oc?.proveedor_snapshot || {};
        setData({ sol, oc, detalle, items, cotizacion });
        setEditValues({
          subtotal: oc?.subtotal ?? cotizacion?.subtotal ?? cotizacion?.total ?? 0,
          descuento_valor: oc?.descuento_valor ?? 0,
          iva_valor: oc?.iva_valor ?? 0,
          retefuente_valor: oc?.retefuente_valor ?? 0,
          observaciones: oc?.observaciones ?? cotizacion?.observaciones ?? "",
          fecha_compromiso_entrega: oc?.fecha_compromiso_entrega ?? cotizacion?.fecha_compromiso_entrega ?? "",
          prov_razon_social: provSnapshot.razon_social ?? proveedor?.razon_social ?? "",
          prov_contacto: provSnapshot.contacto ?? proveedor?.contacto ?? "",
          prov_correo: provSnapshot.correo ?? proveedor?.correo ?? "",
          prov_direccion: provSnapshot.direccion ?? proveedor?.direccion ?? "",
          prov_telefono: provSnapshot.telefono ?? proveedor?.telefono ?? "",
          prov_nit: provSnapshot.nit ?? proveedor?.nit ?? ""
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [solicitudId]);

  if (loading) return <div className="oc-loader">Cargando formato OC...</div>;
  if (error) return <div className="oc-error">Error: {error}</div>;
  if (!data?.oc) return <div className="oc-error">No se ha generado la Orden de Compra para esta solicitud.</div>;

  const { sol, oc, detalle, items, cotizacion } = data;
  const proveedor = cotizacion?.compras_proveedores;
  const canEdit = sol?.estado_id === 23;

  const handlePrint = () => {
    window.print();
  };

  const handleSave = async () => {
    setSaving(true);
    const total_factura = Number(editValues.subtotal) - Number(editValues.descuento_valor);
    const total_neto = total_factura + Number(editValues.iva_valor) - Number(editValues.retefuente_valor);

    const { error: updErr } = await supabase
      .from("compras_ordenes_compra")
      .update({
        subtotal: Number(editValues.subtotal),
        descuento_valor: Number(editValues.descuento_valor),
        iva_valor: Number(editValues.iva_valor),
        retefuente_valor: Number(editValues.retefuente_valor),
        total_neto: total_neto,
        observaciones: editValues.observaciones,
        fecha_compromiso_entrega: editValues.fecha_compromiso_entrega,
        proveedor_snapshot: {
          razon_social: editValues.prov_razon_social,
          contacto: editValues.prov_contacto,
          correo: editValues.prov_correo,
          direccion: editValues.prov_direccion,
          telefono: editValues.prov_telefono,
          nit: editValues.prov_nit
        }
      })
      .eq("id", oc.id);

    setSaving(false);
    if (updErr) {
      alert(`Error guardando: ${updErr.message}`);
    } else {
      alert("Cambios guardados correctamente.");
      // Actualizar el estado local para reflejar los cambios
      setData({
        ...data,
        oc: {
          ...oc,
          ...editValues,
          total_neto
        }
      });
    }
  };

  const handleChange = (field, val) => {
    setEditValues(prev => ({ ...prev, [field]: val }));
  };

  // Cálculos dinámicos
  const currentSubtotal = editValues?.subtotal ?? 0;
  const currentDescuento = editValues?.descuento_valor ?? 0;
  const currentIva = editValues?.iva_valor ?? 0;
  const currentRetefuente = editValues?.retefuente_valor ?? 0;
  const calcTotalFactura = Number(currentSubtotal) - Number(currentDescuento);
  const calcTotalNeto = calcTotalFactura + Number(currentIva) - Number(currentRetefuente);

  const displayProv = {
    razon_social: oc?.proveedor_snapshot?.razon_social ?? proveedor?.razon_social ?? "",
    contacto: oc?.proveedor_snapshot?.contacto ?? proveedor?.contacto ?? "",
    correo: oc?.proveedor_snapshot?.correo ?? proveedor?.correo ?? "",
    direccion: oc?.proveedor_snapshot?.direccion ?? proveedor?.direccion ?? "",
    telefono: oc?.proveedor_snapshot?.telefono ?? proveedor?.telefono ?? "",
    nit: oc?.proveedor_snapshot?.nit ?? proveedor?.nit ?? ""
  };
  const displayFecha = oc?.fecha_compromiso_entrega ?? cotizacion?.fecha_compromiso_entrega ?? "dd/mm/yy";

  return (
    <div className="oc-pdf-overlay">
      <div className="oc-pdf-container">
        <div className="oc-pdf-actions no-print">
          {canEdit && (
            <button className="oc-btn-print" onClick={handleSave} disabled={saving} style={{ backgroundColor: '#eab308', marginRight: '10px' }}>
              {saving ? '⏳ Guardando...' : '💾 Guardar Cambios'}
            </button>
          )}
          <button className="oc-btn-print" onClick={handlePrint}>🖨 Imprimir PDF</button>
          <button className="oc-btn-close" onClick={onClose}>✖ Cerrar</button>
        </div>

        <div className="oc-pdf-page">
          <div className="oc-fr-wrapper">
            {/* 1. HEADER */}
            <div className="oc-fr-header">
              <div className="oc-fr-logo-cell">
                <img src="https://gqspcolombia.org/wp-content/uploads/2025/09/21.png" alt="Logo" className="oc-fr-logo" />
              </div>
              <div className="oc-fr-titles">
                <div className="oc-fr-row-title">COMPRAS</div>
                <div className="oc-fr-row-title2">TITULO: ORDEN DE COMPRA</div>
                <div className="oc-fr-row-title-split">
                  <div className="oc-fr-col-50">VERSION 06</div>
                  <div className="oc-fr-col-50 no-right">FECHA DE VIGENCIA: <br/>01 DE SEPTIEMBRE DE 2022</div>
                </div>
              </div>
              <div className="oc-fr-codes">
                <div className="oc-fr-row-code">CODIGO:<br/>FR-CO-07</div>
                <div className="oc-fr-row-code no-bottom">Página 1 de 2</div>
              </div>
            </div>

            {/* 2. COMPANY INFO */}
            <div className="oc-fr-section oc-fr-bg-gray">
              <strong>Información de Laboratorios Gusing S.A.S</strong>
            </div>
            <div className="oc-fr-company-info">
              <div className="oc-fr-company-left">
                <div>NIT 832.000.435-6</div>
                <div>Cra 10 Este # 30 - 03 Tel: 781 75 98</div>
                <div>San Mateo - Soacha</div>
              </div>
              <div className="oc-fr-company-right">
                <div className="oc-fr-row-gray">ORDEN DE COMPRA</div>
                <div className="oc-fr-row-val">No {oc.numero_oc}</div>
              </div>
            </div>

            {/* 3. PROVIDER INFO */}
            <div className="oc-fr-section oc-fr-bg-gray">
              <strong>SEÑORES</strong>
            </div>
            <div className="oc-fr-provider-info">
              <div className="oc-fr-prov-left">
                <div className="oc-fr-prov-row">
                  <div className="oc-fr-lbl">NOMBRE DEL PROVEEDOR:</div>
                  <div className="oc-fr-val">
                    {canEdit ? (
                      <input type="text" value={editValues?.prov_razon_social || ""} onChange={e => handleChange('prov_razon_social', e.target.value)} style={{ width: '100%', border: '1px solid #ccc' }} />
                    ) : displayProv.razon_social}
                  </div>
                </div>
                <div className="oc-fr-prov-row">
                  <div className="oc-fr-lbl">Contacto:</div>
                  <div className="oc-fr-val">
                    {canEdit ? (
                      <input type="text" value={editValues?.prov_contacto || ""} onChange={e => handleChange('prov_contacto', e.target.value)} style={{ width: '100%', border: '1px solid #ccc' }} />
                    ) : displayProv.contacto}
                  </div>
                </div>
                <div className="oc-fr-prov-row">
                  <div className="oc-fr-lbl">Correo:</div>
                  <div className="oc-fr-val">
                    {canEdit ? (
                      <input type="text" value={editValues?.prov_correo || ""} onChange={e => handleChange('prov_correo', e.target.value)} style={{ width: '100%', border: '1px solid #ccc' }} />
                    ) : displayProv.correo}
                  </div>
                </div>
                <div className="oc-fr-prov-row">
                  <div className="oc-fr-lbl">Dirección:</div>
                  <div className="oc-fr-val">
                    {canEdit ? (
                      <input type="text" value={editValues?.prov_direccion || ""} onChange={e => handleChange('prov_direccion', e.target.value)} style={{ width: '100%', border: '1px solid #ccc' }} />
                    ) : displayProv.direccion}
                  </div>
                </div>
                <div className="oc-fr-prov-row">
                  <div className="oc-fr-lbl">TEL:</div>
                  <div className="oc-fr-val">
                    {canEdit ? (
                      <input type="text" value={editValues?.prov_telefono || ""} onChange={e => handleChange('prov_telefono', e.target.value)} style={{ width: '100%', border: '1px solid #ccc' }} />
                    ) : displayProv.telefono}
                  </div>
                </div>
                <div className="oc-fr-prov-row no-bottom">
                  <div className="oc-fr-lbl">NIT:</div>
                  <div className="oc-fr-val">
                    {canEdit ? (
                      <input type="text" value={editValues?.prov_nit || ""} onChange={e => handleChange('prov_nit', e.target.value)} style={{ width: '100%', border: '1px solid #ccc' }} />
                    ) : displayProv.nit}
                  </div>
                </div>
              </div>
              <div className="oc-fr-prov-right">
                <div className="oc-fr-row-gray">N° de Requisición</div>
                <div className="oc-fr-row-val">C-{sol.consecutivo}</div>
                <div className="oc-fr-row-gray">FECHA DE LA ORDEN DE COMPRA</div>
                <div className="oc-fr-row-val">{new Date(oc.created_at).toLocaleDateString('es-CO')}</div>
                <div className="oc-fr-row-gray">Número de cotización</div>
                <div className="oc-fr-row-val no-bottom">{cotizacion?.id || ""}</div>
              </div>
            </div>

            {/* 4. COMPROMISE DATE */}
            <div className="oc-fr-compromise">
              <div className="oc-fr-lbl-comp">Fecha de Compromiso de Entrega:</div>
              <div className="oc-fr-val-comp">
                {canEdit ? (
                  <input type="text" value={editValues?.fecha_compromiso_entrega || ""} onChange={e => handleChange('fecha_compromiso_entrega', e.target.value)} style={{ width: '200px', border: '1px solid #ccc' }} placeholder="Ej: 01-01-2024 o Inmediata" />
                ) : displayFecha}
              </div>
            </div>

            {/* 5. ITEMS TABLE */}
            <div className="oc-fr-table-wrapper">
              <table className="oc-fr-table">
                <thead>
                  <tr className="oc-fr-bg-gray">
                    <th style={{width: '10%'}}>CANTIDAD</th>
                    <th style={{width: '60%'}}>CONCEPTO</th>
                    <th style={{width: '15%'}}>V.UNITARIO</th>
                    <th style={{width: '15%'}}>V.TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {items.sort((a,b) => a.orden - b.orden).map((it) => {
                    const cant = Number(it.cantidad_solicitada || 1);
                    const avgTotal = Number(cotizacion?.total || 0) / (items.length || 1);
                    const unitario = avgTotal / cant;
                    return (
                      <tr key={it.id}>
                        <td style={{textAlign: 'center'}}>{cant}</td>
                        <td>{it.descripcion} {it.referencia ? ` (Ref: ${it.referencia})` : ""}</td>
                        <td style={{textAlign: 'right'}}>${unitario.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                        <td style={{textAlign: 'right'}}>${avgTotal.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                      </tr>
                    );
                  })}
                  {/* Fill empty rows to make it look like the Excel sheet */}
                  {Array.from({ length: Math.max(0, 15 - items.length) }).map((_, i) => (
                    <tr key={`empty-${i}`}>
                      <td>&nbsp;</td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 6. TOTALS */}
            <div className="oc-fr-totals">
              <div className="oc-fr-tot-empty"></div>
              <div className="oc-fr-tot-values">
                <div className="oc-fr-tot-row">
                  <div className="oc-fr-tot-lbl">SUB-TOTAL</div>
                  <div className="oc-fr-tot-val">
                    {canEdit ? (
                      <input type="number" value={editValues?.subtotal || ""} onChange={e => handleChange('subtotal', e.target.value)} style={{ width: '100px', textAlign: 'right', border: '1px solid #ccc' }} />
                    ) : (
                      `$${Number(oc?.subtotal ?? cotizacion?.subtotal ?? cotizacion?.total ?? 0).toLocaleString()}`
                    )}
                  </div>
                </div>
                <div className="oc-fr-tot-row">
                  <div className="oc-fr-tot-lbl">DESCUENTO</div>
                  <div className="oc-fr-tot-val">
                    {canEdit ? (
                      <input type="number" value={editValues?.descuento_valor || ""} onChange={e => handleChange('descuento_valor', e.target.value)} style={{ width: '100px', textAlign: 'right', border: '1px solid #ccc' }} />
                    ) : (
                      `$${Number(oc?.descuento_valor ?? 0).toLocaleString()}`
                    )}
                  </div>
                </div>
                <div className="oc-fr-tot-row">
                  <div className="oc-fr-tot-lbl">TOTAL FACTURA</div>
                  <div className="oc-fr-tot-val">${calcTotalFactura.toLocaleString()}</div>
                </div>
                <div className="oc-fr-tot-row">
                  <div className="oc-fr-tot-lbl">IVA</div>
                  <div className="oc-fr-tot-val">
                    {canEdit ? (
                      <input type="number" value={editValues?.iva_valor || ""} onChange={e => handleChange('iva_valor', e.target.value)} style={{ width: '100px', textAlign: 'right', border: '1px solid #ccc' }} />
                    ) : (
                      `$${Number(oc?.iva_valor ?? 0).toLocaleString()}`
                    )}
                  </div>
                </div>
                <div className="oc-fr-tot-row">
                  <div className="oc-fr-tot-lbl">RETEFUENTE</div>
                  <div className="oc-fr-tot-val">
                    {canEdit ? (
                      <input type="number" value={editValues?.retefuente_valor || ""} onChange={e => handleChange('retefuente_valor', e.target.value)} style={{ width: '100px', textAlign: 'right', border: '1px solid #ccc' }} />
                    ) : (
                      `$${Number(oc?.retefuente_valor ?? 0).toLocaleString()}`
                    )}
                  </div>
                </div>
                <div className="oc-fr-tot-row no-bottom">
                  <div className="oc-fr-tot-lbl">TOTAL NETO</div>
                  <div className="oc-fr-tot-val">${calcTotalNeto.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* 7. OBSERVATIONS */}
            <div className="oc-fr-obs-section">
              <div className="oc-fr-obs-header">ANOTACIONES DE LA ORDEN DE COMPRA EN LA PAGINA DE OBSERVACIONES Y/O SEGUIMIENTO</div>
              <div className="oc-fr-obs-content">
                {canEdit ? (
                  <textarea 
                    value={editValues?.observaciones || ""} 
                    onChange={e => handleChange('observaciones', e.target.value)}
                    style={{ width: '100%', border: '1px solid #ccc', minHeight: '60px', fontFamily: 'inherit', resize: 'vertical', padding: '5px' }}
                  />
                ) : (
                  oc?.observaciones || cotizacion?.observaciones || " "
                )}
              </div>
            </div>

            {/* 8. SIGNATURES */}
            <div className="oc-fr-signatures">
              <div className="oc-fr-sig-box">
                <div className="oc-fr-sig-line">FIRMA Y FECHA DE REVISADO</div>
              </div>
              <div className="oc-fr-sig-box no-right">
                <div className="oc-fr-sig-line">FIRMA Y FECHA DE AUTORIZADO</div>
              </div>
            </div>
            
          </div>
        </div>
        
        <div className="oc-pdf-page page-break-before" style={{ marginTop: '30px' }}>
          <div className="oc-fr-wrapper">
            {/* 1. HEADER (Same as page 1) */}
            <div className="oc-fr-header">
              <div className="oc-fr-logo-cell">
                <img src="https://gqspcolombia.org/wp-content/uploads/2025/09/21.png" alt="Logo" className="oc-fr-logo" />
              </div>
              <div className="oc-fr-titles">
                <div className="oc-fr-row-title">COMPRAS</div>
                <div className="oc-fr-row-title2">TITULO: ORDEN DE COMPRA</div>
                <div className="oc-fr-row-title-split">
                  <div className="oc-fr-col-50">VERSION 06</div>
                  <div className="oc-fr-col-50 no-right">FECHA DE VIGENCIA: <br/>01 DE SEPTIEMBRE DE 2022</div>
                </div>
              </div>
              <div className="oc-fr-codes">
                <div className="oc-fr-row-code">CODIGO:<br/>FR-CO-07</div>
                <div className="oc-fr-row-code no-bottom">Página 2 de 2</div>
              </div>
            </div>

            {/* OBSERVATIONS PAGE 2 */}
            <div className="oc-fr-obs2-header">
              OBSERVACIONES Y/O SEGUIMIENTO A LA ORDEN DE COMPRA
            </div>
            <div className="oc-fr-obs2-lines">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={`obs-line-${i}`} className="oc-fr-obs2-line"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
