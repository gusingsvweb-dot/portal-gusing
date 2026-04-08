import React, { useState, useEffect } from "react";
import { supabase, st, ss } from "../api/supabaseClient";
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
    prioridad: "Muy Alto",
    observaciones: "",
  });

  // 📦 Estados para carga masiva
  const [bulkItems, setBulkItems] = useState([]); // Array de pedidos detectados
  const [clienteGlobal, setClienteGlobal] = useState(""); // Para asignar a todos con un clic

  // 🗺️ Estados para mapeo dinámico
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [rawExcelData, setRawExcelData] = useState([]);
  const [mappingCols, setMappingCols] = useState({ description: "", quantity: "" });

  useEffect(() => {
    cargarClientes();
    cargarProductos();
  }, []);


  async function cargarClientes() {
    const { data } = await supabase.from(st("clientes")).select(ss("*")).order("nombre");
    setClientes(data || []);
  }

  async function cargarProductos() {
    const { data } = await supabase.from(st("productos")).select(ss("*")).order("articulo");
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

      // 🛑 Filtrado universal: Si alguna columna contiene "SE ENVIA A MEDIDA QUE SALGA DE PRODUCCION", cortar ahí.
      const stopWord = "SE ENVIA A MEDIDA QUE SALGA DE PRODUCCION";
      const stopIndex = data.findIndex(row => 
        Object.values(row).some(val => String(val).toUpperCase().includes(stopWord))
      );
      const filteredData = stopIndex === -1 ? data : data.slice(0, stopIndex);

      // 🔍 Detectar si es el formato complejo
      const allHeaders = XLSX.utils.sheet_to_json(ws, { header: 1 })[0] || [];
      const hasComplexHeaders = allHeaders.includes("Vr. Unit") || allHeaders.includes("Bodega") || allHeaders.includes("Concepto (Comentario)");

      if (hasComplexHeaders && !allHeaders.includes("descripcion")) {
        setExcelHeaders(allHeaders);
        setRawExcelData(filteredData);
        setShowMappingModal(true);
        return;
      }

      const itemsDetectados = filteredData.map((row, index) => {
        // Buscar columnas (pueden variar nombres ligeramente por espacios)
        const rawConcepto = row["Concepto (Comentario)"] || row["Concepto"] || row["descripcion"];
        const concepto = rawConcepto ? String(rawConcepto).trim() : "";
        const cantidadStr = row["Cantidad"] || row["cantidad"] || 0;

        // Extraer referencia entre paréntesis (...) o usar el texto completo si no hay
        const match = concepto.match(/\(([^)]+)\)/);
        const refDetectada = match ? match[1].trim() : null;

        // Buscar producto con coincidencia flexible
        let prod = null;
        if (refDetectada) {
          prod = productos.find(p => {
            const refP = String(p.referencia || "").trim().replace(/^0+/, "");
            const refExcel = String(refDetectada).replace(/^0+/, "");
            return refP === refExcel;
          });
        }
        
        if (!prod && concepto) {
          // Intentar por nombre exacto (ignorando espacios extras)
          const cleanConcepto = concepto.toLowerCase().replace(/\s+/g, ' ').trim();
          prod = productos.find(p => 
            (p.articulo || "").toLowerCase().replace(/\s+/g, ' ').trim() === cleanConcepto
          );
        }

        return {
          idTmp: index,
          referencia: prod ? prod.referencia : (refDetectada || "N/A"),
          articulo: prod ? prod.articulo : (concepto || "Sin Descripción"),
          cantidad: Number(cantidadStr),
          cliente_id: "",
          prioridad: "Muy Alto",
          observaciones: "",
          encontrado: !!prod
        };
      }).filter(item => (item.referencia !== "N/A" || item.articulo !== "Sin Descripción") && item.cantidad > 0);

      if (itemsDetectados.length === 0) {
        alert("No se detectaron productos válidos. Asegúrate de que el archivo tenga columnas de descripción/concepto y cantidad.");
        return;
      }

      setBulkItems(itemsDetectados);
      setMensaje("");
    };
    reader.readAsBinaryString(file);
    e.target.value = null; // Reset input
  };

  const procesarMapeo = async () => {
    if (!mappingCols.description || !mappingCols.quantity) {
      alert("Por favor, selecciona las columnas para Descripción y Cantidad.");
      return;
    }

    setLoading(true);
    setMensaje("⏳ Procesando mapeo y verificando productos...");
    
    try {
      let localProductos = [...productos];
      const nuevosItems = [];

      for (let i = 0; i < rawExcelData.length; i++) {
        const row = rawExcelData[i];
        const desc = String(row[mappingCols.description] || "").trim();
        const cant = Number(row[mappingCols.quantity] || 0);

        // 🛑 Detener si aparece el texto prohibido (doble verificación por seguridad)
        if (desc.toUpperCase().includes("SE ENVIA A MEDIDA QUE SALGA DE PRODUCCION")) {
          break;
        }

        if (!desc || cant <= 0) continue;

        // Intentar buscar por nombre (normalizado)
        const cleanDesc = desc.toLowerCase().replace(/\s+/g, ' ').trim();
        let prod = localProductos.find(p => 
          (p.articulo || "").toLowerCase().replace(/\s+/g, ' ').trim() === cleanDesc
        );

        if (!prod) {
          // Generar referencia aleatoria única
          const timestamp = Date.now().toString().slice(-4);
          const random = Math.floor(1000 + Math.random() * 9000);
          const refAleatoria = `99${timestamp}${random}`; // Usar números por si acaso la columna es numérica
          
          const { data: newProd, error: errIns } = await supabase.from(st("productos")).insert([{
            referencia: refAleatoria,
            articulo: desc
          }]).select(ss("*"));

          if (errIns) {
            console.error("Error creando producto:", errIns);
            // Si falla con la referencia numérica larga, intentar una más corta o reportar
            alert(`Error al registrar el producto "${desc}": ${errIns.message}`);
          } else if (newProd && newProd[0]) {
            prod = newProd[0];
            localProductos.push(prod);
          }
        }

        nuevosItems.push({
          idTmp: i,
          referencia: prod ? prod.referencia : "N/A",
          articulo: prod ? prod.articulo : desc,
          cantidad: cant,
          cliente_id: "",
          prioridad: "Muy Alto",
          observaciones: "Carga vía Excel (Nuevo Formato)",
          encontrado: !!prod
        });
      }

      setProductos(localProductos);
      setBulkItems(nuevosItems);
      setShowMappingModal(false);
      setMensaje("");
    } catch (err) {
      console.error(err);
      alert("Error procesando el mapeo: " + err.message);
    } finally {
      setLoading(false);
    }
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

      const { data: pIns, error: errP } = await supabase.from(st("pedidos_produccion")).insert([nuevoP]).select(ss("*"));
        if (errP) throw errP;

        const pedidoId = pIns[0].id;

        // 2. Observación
        if (it.observaciones.trim()) {
          await supabase.from(st("observaciones_pedido")).insert([{
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

        const { data: pIns, error: errP } = await supabase.from(st("pedidos_produccion")).insert([nuevoPedido]).select(ss("*"));
      if (errP) throw errP;

      const pedidoId = pIns[0].id;

      if (form.observaciones.trim()) {
        await supabase.from(st("observaciones_pedido")).insert([{
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

      {/* 🗺️ MODAL DE MAPEO */}
      {showMappingModal && (
        <div className="ac-modal-overlay">
          <div className="ac-modal-content fadeIn">
            <h3 className="ac-modal-title">🗺️ Mapear Columnas de Excel</h3>
            <p className="ac-modal-subtitle">Selecciona qué columnas corresponden a cada dato necesario.</p>
            
            <div className="ac-form">
              <div className="ac-field">
                <label>Columna de Producto / Descripción</label>
                <select 
                  value={mappingCols.description} 
                  onChange={(e) => setMappingCols({ ...mappingCols, description: e.target.value })}
                >
                  <option value="">Seleccione columna...</option>
                  {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div className="ac-field">
                <label>Columna de Cantidad</label>
                <select 
                  value={mappingCols.quantity} 
                  onChange={(e) => setMappingCols({ ...mappingCols, quantity: e.target.value })}
                >
                  <option value="">Seleccione columna...</option>
                  {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div className="ac-bulk-actions" style={{ marginTop: '20px' }}>
                <button className="ac-bulk-btn-cancel" onClick={() => setShowMappingModal(false)}>Cancelar</button>
                <button className="ac-btn" style={{ padding: '10px 30px' }} onClick={procesarMapeo} disabled={loading}>
                  {loading ? "Procesando..." : "Continuar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}

