import React, { useEffect, useState } from "react";
import { supabase, st, ss } from "../../api/supabaseClient";
import "./OrdenCompraPDF.css";

export default function OrdenCompraPDF({ solicitudId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        
        setData({ sol, oc, detalle, items, cotizacion });
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="oc-pdf-overlay">
      <div className="oc-pdf-container">
        <div className="oc-pdf-actions no-print">
          <button className="oc-btn-print" onClick={handlePrint}>🖨 Imprimir PDF</button>
          <button className="oc-btn-close" onClick={onClose}>✖ Cerrar</button>
        </div>

        <div className="oc-pdf-page">
          <div className="oc-header">
            <div className="oc-logo-placeholder">
              <h2>Gusing S.A.S</h2>
              <p>NIT: 900.XXX.XXX-X</p>
            </div>
            <div className="oc-title-box">
              <h1>ORDEN DE COMPRA</h1>
              <p>Formato: FR-CO-07</p>
            </div>
            <div className="oc-meta-box">
              <p><strong>N° OC:</strong> {oc.numero_oc}</p>
              <p><strong>Fecha:</strong> {new Date(oc.created_at).toLocaleDateString()}</p>
              <p><strong>Requisición:</strong> C-{sol.consecutivo}</p>
            </div>
          </div>

          <div className="oc-section">
            <h3>Datos del Proveedor</h3>
            <div className="oc-grid-2">
              <p><strong>Razón Social:</strong> {proveedor?.razon_social}</p>
              <p><strong>NIT/Cédula:</strong> {proveedor?.nit}</p>
              <p><strong>Teléfono:</strong> {proveedor?.telefono || "N/A"}</p>
              <p><strong>Condiciones de Pago:</strong> {cotizacion?.condiciones_pago || "N/A"}</p>
              <p><strong>Fecha Promesa Entrega:</strong> {cotizacion?.fecha_compromiso_entrega || "N/A"}</p>
            </div>
          </div>

          <div className="oc-section">
            <h3>Detalle de Ítems</h3>
            <table className="oc-table">
              <thead>
                <tr>
                  <th>Ítem</th>
                  <th>Descripción</th>
                  <th>Ref.</th>
                  <th>Cant.</th>
                  <th>Und.</th>
                </tr>
              </thead>
              <tbody>
                {items.sort((a,b) => a.orden - b.orden).map((it) => (
                  <tr key={it.id}>
                    <td>{it.orden}</td>
                    <td>{it.descripcion}</td>
                    <td>{it.referencia || "-"}</td>
                    <td>{it.cantidad_solicitada}</td>
                    <td>{it.unidad_medida}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="oc-totals">
            <div className="oc-totals-box">
              <p><strong>Subtotal:</strong> ${Number(cotizacion?.subtotal || 0).toLocaleString()}</p>
              <p><strong>Impuestos:</strong> ${Number(cotizacion?.impuestos || 0).toLocaleString()}</p>
              <p><strong>Descuento:</strong> ${Number(cotizacion?.descuento || 0).toLocaleString()}</p>
              <p className="oc-total-final"><strong>TOTAL:</strong> ${Number(cotizacion?.total || 0).toLocaleString()} {cotizacion?.moneda}</p>
            </div>
          </div>
          
          {cotizacion?.observaciones && (
            <div className="oc-section">
              <h3>Observaciones</h3>
              <p>{cotizacion.observaciones}</p>
            </div>
          )}

          <div className="oc-signatures">
            <div className="oc-sig-box">
              <div className="oc-sig-line"></div>
              <p>Aprobado por Gerencia</p>
            </div>
            <div className="oc-sig-box">
              <div className="oc-sig-line"></div>
              <p>Elaborado por Compras</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
