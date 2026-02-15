import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar.jsx";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import { notifyRoles } from "../api/notifications";
import SearchableSelect from "../components/SearchableSelect";
import * as XLSX from "xlsx"; // 📊 Importar SheetJS
import "./AtencionCliente.css";

export default function AtencionCliente() {
  const { usuarioActual } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);

  // Estados para carga individual
  const [form, setForm] = useState({
    cliente_id: "",
    producto_id: "",
    cantidad: "",
    prioridad: "Bajo",
    observaciones: "",
  });

  // 📦 Estados para carga masiva
  const [bulkItems, setBulkItems] = useState([]); // Array de pedidos detectados
  const [clienteGlobal, setClienteGlobal] = useState(""); // Para asignar a todos con un clic

  useEffect(() => {
    cargarClientes();
    cargarProductos();
  }, []);


  async function cargarClientes() {
    const { data } = await supabase.from("clientes").select("*").order("nombre");
    setClientes(data || []);
  }

  async function cargarProductos() {
    const { data } = await supabase.from("productos").select("*").order("articulo");
    setProductos(data || []);
  }

  function actualizarForm(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  // ==========================================================
  //                LÓGICA EXCEL (CARGA MASIVA)
  // ==========================================================
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);

      console.log("📊 Datos crudos del Excel:", data);

      const itemsDetectados = data.map((row, index) => {
        // Buscar columnas (pueden variar nombres ligeramente por espacios)
        const rawConcepto = row["Concepto (Comentario)"] || row["Concepto"];
        const concepto = rawConcepto ? String(rawConcepto) : "";
        const cantidadStr = row["Cantidad"] || 0;

        // Extraer referencia entre paréntesis (...)
        const match = concepto.match(/\(([^)]+)\)/);
        const refDetectada = match ? match[1].trim() : null;

        // Buscar producto con coincidencia flexible (ignorando ceros a la izquierda y tipos)
        let prod = null;
        if (refDetectada) {
          prod = productos.find(p => {
            // Normalizar a string y quitar ceros al inicio para comparar
            const refP = String(p.referencia).replace(/^0+/, "");
            const refExcel = String(refDetectada).replace(/^0+/, "");
            return refP === refExcel;
          });
        }

        return {
          idTmp: index,
          referencia: refDetectada,
          articulo: prod ? prod.articulo : (refDetectada ? `Ref: ${refDetectada} (No encontrada)` : "Sin Referencia"),
          cantidad: Number(cantidadStr),
          cliente_id: "",
          prioridad: "Bajo",
          observaciones: "",
          encontrado: !!prod
        };
      }).filter(item => item.referencia && item.cantidad > 0); // Filtrar filas vacías o sin ref

      if (itemsDetectados.length === 0) {
        alert("No se detectaron productos válidos con formato (referencia) en la columna 'Concepto'.");
        return;
      }

      setBulkItems(itemsDetectados);
      setMensaje("");
    };
    reader.readAsBinaryString(file);
    e.target.value = null; // Reset input
  };

  const updateBulkItem = (id, field, value) => {
    setBulkItems(prev => prev.map(it => it.idTmp === id ? { ...it, [field]: value } : it));
  };

  const aplicarClienteGlobal = () => {
    if (!clienteGlobal) return;
    setBulkItems(prev => prev.map(it => ({ ...it, cliente_id: clienteGlobal })));
  };

  async function enviarMasivo() {
    const incompletos = bulkItems.some(it => !it.cliente_id || !it.encontrado);
    if (incompletos) {
      alert("Por favor, asigna un Cliente a todos los productos y asegúrate de que las referencias existan en el sistema.");
      return;
    }

    setLoading(true);
    setMensaje("⏳ Procesando carga masiva...");

    try {
      for (const it of bulkItems) {
        // 1. Crear Pedido
        const nuevoP = {
          referencia: it.referencia, // Ya es string/number según DB
          cliente_id: Number(it.cliente_id),
          cantidad: it.cantidad,
          fecha_recepcion_cliente: new Date().toISOString().slice(0, 10),
          estado_id: 1,
          prioridad: it.prioridad
        };

        const { data: pIns, error: errP } = await supabase.from("pedidos_produccion").insert([nuevoP]).select("*");
        if (errP) throw errP;

        const pedidoId = pIns[0].id;

        // 2. Observación
        if (it.observaciones.trim()) {
          await supabase.from("observaciones_pedido").insert([{
            pedido_id: pedidoId,
            usuario: usuarioActual.usuario,
            observacion: it.observaciones.trim()
          }]);
        }

        // 3. Notificar
        await notifyRoles(
          ["produccion", "gerencia"],
          "Nuevo Pedido (Masivo)",
          `Pedido #${pedidoId} registrado vía Excel.`,
          pedidoId
        );
      }

      setBulkItems([]);
      setMensaje("✅ ¡Todos los pedidos del archivo han sido registrados!");
    } catch (err) {
      console.error(err);
      setMensaje("❌ Error en la carga masiva: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================
  //                   INSERTAR PEDIDO INDIVIDUAL
  // ==========================================================
  async function enviarPedido(e) {
    e.preventDefault();
    setMensaje("");
    setLoading(true);

    if (!usuarioActual?.usuario) {
      setMensaje("❌ Error: no se detectó el usuario.");
      setLoading(false);
      return;
    }

    try {
      const nuevoPedido = {
        referencia: form.producto_id, // Usamos la referencia seleccionada
        cliente_id: Number(form.cliente_id),
        cantidad: Number(form.cantidad),
        fecha_recepcion_cliente: new Date().toISOString().slice(0, 10),
        estado_id: 1,
        prioridad: form.prioridad,
      };

      const { data: pIns, error: errP } = await supabase.from("pedidos_produccion").insert([nuevoPedido]).select("*");
      if (errP) throw errP;

      const pedidoId = pIns[0].id;

      if (form.observaciones.trim()) {
        await supabase.from("observaciones_pedido").insert([{
          pedido_id: pedidoId,
          usuario: usuarioActual.usuario,
          observacion: form.observaciones.trim()
        }]);
      }

      await notifyRoles(
        ["produccion", "gerencia"],
        "Nuevo Pedido Registrado",
        `Pedido #${pedidoId} - ${clientes.find(c => c.id == form.cliente_id)?.nombre}`,
        pedidoId
      );

      setMensaje("✔ Pedido registrado correctamente.");
      setForm({ cliente_id: "", producto_id: "", cantidad: "", prioridad: "Bajo", observaciones: "" });
    } catch (err) {
      setMensaje("❌ Error: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />

      <div className="ac-wrapper">
        <div className={`ac-card fadeIn ${bulkItems.length > 0 ? "wide" : ""}`}>

          <h2 className="ac-title">
            {bulkItems.length > 0 ? "Revisar Carga Masiva" : "Registrar Pedido"}
          </h2>
          <p className="ac-subtitle">
            {bulkItems.length > 0
              ? `Se detectaron ${bulkItems.length} productos en el archivo.`
              : "Complete los datos del pedido o adjunte un archivo Excel."
            }
          </p>

          {bulkItems.length === 0 ? (
            <>
              {/* ZONA DE CARGA DE ARCHIVO */}
              <div className="ac-bulk-upload-zone" onClick={() => document.getElementById("excel-input").click()}>
                <p>📁 Haz clic aquí para adjuntar archivo Excel (.xls, .xlsx)</p>
                <input
                  id="excel-input"
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </div>

              <form className="ac-form" onSubmit={enviarPedido}>
                <div className="ac-field">
                  <label>Producto *</label>
                  <SearchableSelect
                    name="producto_id"
                    value={form.producto_id}
                    onChange={actualizarForm}
                    options={productos.map(p => ({ value: p.referencia, label: p.articulo }))}
                    placeholder="Buscar producto..."
                    required
                  />
                </div>

                <div className="ac-field">
                  <label>Cliente *</label>
                  <SearchableSelect
                    name="cliente_id"
                    value={form.cliente_id}
                    onChange={actualizarForm}
                    options={clientes.map(c => ({ value: c.id, label: c.nombre }))}
                    placeholder="Buscar cliente..."
                    required
                  />
                </div>

                <div className="ac-field">
                  <label>Cantidad *</label>
                  <input type="number" name="cantidad" value={form.cantidad} onChange={actualizarForm} required />
                </div>

                <div className="ac-field">
                  <label>Prioridad</label>
                  <select name="prioridad" value={form.prioridad} onChange={actualizarForm}>
                    <option value="Bajo">Bajo</option>
                    <option value="Medio">Medio</option>
                    <option value="Alto">Alto</option>
                    <option value="Muy Alto">Muy Alto</option>
                  </select>
                </div>

                <div className="ac-field">
                  <label>Observaciones</label>
                  <textarea name="observaciones" value={form.observaciones} onChange={actualizarForm} rows="3" placeholder="Detalles adicionales…" />
                </div>

                {mensaje && <p className="ac-msg">{mensaje}</p>}

                <button className="ac-btn" disabled={loading}>
                  {loading ? "Registrando..." : "Registrar Pedido"}
                </button>
              </form>
            </>
          ) : (
            /* TABLA CARGA MASIVA */
            <div className="ac-bulk-container fadeIn">

              <div className="ac-field" style={{ marginBottom: "20px", background: "#f1f5f9", padding: "15px", borderRadius: "10px" }}>
                <label style={{ marginBottom: "10px" }}>💎 Asignación Rápida: Cliente para TODOS los productos</label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <SearchableSelect
                    options={clientes.map(c => ({ value: c.id, label: c.nombre }))}
                    value={clienteGlobal}
                    onChange={(e) => setClienteGlobal(e.target.value)}
                    placeholder="Seleccione un cliente común..."
                  />
                  <button className="ac-btn" style={{ padding: "0 20px" }} onClick={aplicarClienteGlobal}>Aplicar</button>
                </div>
              </div>

              <table className="ac-bulk-table">
                <thead>
                  <tr>
                    <th>Producto (Detectado)</th>
                    <th>Cant.</th>
                    <th>Cliente *</th>
                    <th>Prioridad</th>
                    <th>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkItems.map((item) => (
                    <tr key={item.idTmp}>
                      <td style={{ color: item.encontrado ? "inherit" : "red", fontWeight: item.encontrado ? "normal" : "bold" }}>
                        {item.articulo}
                      </td>
                      <td>
                        <input
                          type="number"
                          style={{ width: "60px" }}
                          value={item.cantidad}
                          onChange={(e) => updateBulkItem(item.idTmp, "cantidad", Number(e.target.value))}
                        />
                      </td>
                      <td>
                        <SearchableSelect
                          options={clientes.map(c => ({ value: c.id, label: c.nombre }))}
                          value={item.cliente_id}
                          onChange={(e) => updateBulkItem(item.idTmp, "cliente_id", e.target.value)}
                          placeholder="Cliente..."
                        />
                      </td>
                      <td>
                        <select
                          value={item.prioridad}
                          onChange={(e) => updateBulkItem(item.idTmp, "prioridad", e.target.value)}
                        >
                          <option value="Bajo">Bajo</option>
                          <option value="Medio">Medio</option>
                          <option value="Alto">Alto</option>
                          <option value="Muy Alto">Muy Alto</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder="..."
                          value={item.observaciones}
                          onChange={(e) => updateBulkItem(item.idTmp, "observaciones", e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {mensaje && <p className="ac-msg">{mensaje}</p>}

              <div className="ac-bulk-actions">
                <button className="ac-bulk-btn-cancel" onClick={() => setBulkItems([])}>Cancelar Todo</button>
                <button className="ac-btn" style={{ padding: "15px 40px" }} onClick={enviarMasivo} disabled={loading}>
                  {loading ? "Cargando Pedidos..." : `Registrar ${bulkItems.length} Pedidos`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </>
  );
}

