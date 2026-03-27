// src/pages/Acondicionamiento.jsx
import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import "../pages/Produccion.css"; // reutilizamos los mismos estilos

export default function Acondicionamiento() {
  const [searchParams] = useSearchParams();
  const { usuarioActual } = useAuth();
  const rolUsuario = usuarioActual?.rol || "";

  const [pedidos, setPedidos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [obs, setObs] = useState([]);
  const [newObs, setNewObs] = useState("");

  const [pedidoEtapas, setPedidoEtapas] = useState([]);
  const [etapaParticulas, setEtapaParticulas] = useState(null);

  // 🟦 HISTORIAL (estados globales)
  const [historial, setHistorial] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const ITEMS = 8;

  // NUEVO: Modal de confirmación
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  async function loadHistorial() {
    const { data, error } = await supabase
      .from("pedidos_produccion")
      .select(`
        id,
        productos ( articulo ),
        clientes ( nombre ),
        cantidad,
        fecha_fin_acondicionamiento
      `)
      .not("fecha_fin_acondicionamiento", "is", null)
      .order("fecha_fin_acondicionamiento", { ascending: false });

    if (error) console.error("Error historial:", error);

    setHistorial(data || []);
  }

  useEffect(() => {
    loadHistorial();
  }, []);

  const filtrados = historial.filter((h) => {
    const t = busqueda.trim().toLowerCase();

    // Si no hay texto de búsqueda, devolvemos TODO el historial
    if (!t) return true;

    const prod = (h.productos?.articulo || "").toLowerCase();
    const cli = (h.clientes?.nombre || "").toLowerCase();

    return prod.includes(t) || cli.includes(t);
  });

  const paginas = Math.ceil(filtrados.length / ITEMS) || 1;
  const inicio = (pagina - 1) * ITEMS;
  const lista = filtrados.slice(inicio, inicio + ITEMS);



  /* ===========================================================
  CARGAR SOLO PEDIDOS ASIGNADOS A ACONDICIONAMIENTO
============================================================ */
  async function loadPedidos() {
    const { data, error } = await supabase
      .from("pedidos_produccion")
      .select(`
        *,
        productos ( articulo, presentacion_comercial ),
        clientes ( nombre ),
        estados ( nombre )
      `)
      .eq("asignado_a", "acondicionamiento")
      .order("id", { ascending: false });

    if (error) {
      console.error("❌ Error cargando pedidos:", error);
      return;
    }

    setPedidos(data || []);
  }

  useEffect(() => {
    loadPedidos();
  }, []);

  // Seleccionar automáticamente si viene un ?id= en la URL
  useEffect(() => {
    if (pedidos.length === 0) return;
    const idParam = searchParams.get("id");
    if (!idParam) return;
    const targetId = Number(idParam);
    const p = pedidos.find(it => it.id === targetId);
    if (p) {
      seleccionarPedido(p);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [pedidos, searchParams]);

  /* ===========================================================
      CARGAR OBSERVACIONES
  ============================================================ */
  async function cargarObservaciones(id) {
    const { data } = await supabase
      .from("observaciones_pedido")
      .select("*")
      .eq("pedido_id", id)
      .order("created_at", { ascending: false });

    setObs(data || []);
  }

  /* ===========================================================
      CARGAR ETAPAS INTERNAS DEL PEDIDO
  ============================================================ */
  async function cargarEtapasPedido(pedidoId) {
    if (!pedidoId) return;
    const { data, error } = await supabase
      .from("pedido_etapas")
      .select("*")
      .eq("pedido_id", pedidoId)
      .order("orden", { ascending: true });

    if (error) {
      console.error("❌ Error cargando etapas:", error);
      return;
    }
    setPedidoEtapas(data || []);

    // Buscar específicamente la etapa de partículas visibles
    const particulas = (data || []).find(e =>
      e.nombre.toLowerCase().includes("partículas visibles")
    );
    setEtapaParticulas(particulas || null);
  }

  /* ===========================================================
      SELECCIONAR PEDIDO
  ============================================================ */
  function seleccionarPedido(p) {
    setSelected(p);
    cargarObservaciones(p.id);
    cargarEtapasPedido(p.id);
  }

  /* ===========================================================
      AGREGAR OBSERVACIÓN
  ============================================================ */
  async function addObs() {
    if (!newObs.trim()) return;

    const { error } = await supabase.from("observaciones_pedido").insert([
      {
        pedido_id: selected.id,
        usuario: rolUsuario,
        observacion: newObs,
      },
    ]);

    if (error) {
      alert("Error guardando observación.");
      return;
    }

    setNewObs("");
    cargarObservaciones(selected.id);
  }

  /* ===========================================================
      LIBERAR PARTÍCULAS VISIBLES
  ============================================================ */
  async function liberarParticulas() {
    if (!etapaParticulas) return;
    setLoadingAction(true);

    try {
      const { error } = await supabase
        .from("pedido_etapas")
        .update({
          estado: "completada",
          fecha_inicio: etapaParticulas.fecha_inicio || new Date().toISOString(),
          fecha_fin: new Date().toISOString()
        })
        .eq("id", etapaParticulas.id);

      if (error) throw error;

      await supabase.from("observaciones_pedido").insert({
        pedido_id: selected.id,
        usuario: "Acondicionamiento",
        observacion: "📌 REVISIÓN DE PARTÍCULAS VISIBLES: Completada en Acondicionamiento."
      });

      alert("✔ Revisión de partículas completada.");
      await cargarEtapasPedido(selected.id);
      cargarObservaciones(selected.id);
    } catch (err) {
      console.error("Error liberando particulas:", err);
      alert("Error al liberar partículas.");
    } finally {
      setLoadingAction(false);
    }
  }

  /* ===========================================================
      AVANZAR ETAPA (SOLO ESTADO 8)
  ============================================================ */
  async function avanzarAcondicionamiento() {
    if (!selected) return;
    if (selected.estado_id !== 8) return;

    // BLOQUEO: Si tiene etapa de partículas y no está completada
    if (etapaParticulas && etapaParticulas.estado !== "completada") {
      alert("No puedes iniciar el acondicionamiento sin antes completar la Revisión de Partículas Visibles.");
      return;
    }

    const fechaHoy = new Date().toISOString().slice(0, 10);
    const update = {
      fecha_inicio_acondicionamiento: fechaHoy,
      estado_id: 9, // pasa a Fin acondicionamiento
      asignado_a: "acondicionamiento",
    };

    const { error } = await supabase
      .from("pedidos_produccion")
      .update(update)
      .eq("id", selected.id);

    if (error) {
      alert("Error guardando etapa.");
      return;
    }

    alert("✔ Inicio de acondicionamiento registrado.");
    await loadPedidos();
    setSelected(null);
    setObs([]);
  }

  /* ===========================================================
      FINALIZAR ACONDICIONAMIENTO (ESTADO 9)
      Muestra el modal de confirmación
  ============================================================ */
  function solicitarConfirmacion() {
    if (!selected) return;
    if (selected.estado_id !== 9) return;

    // BLOQUEO (doble check): Si tiene etapa de partículas y no está completada
    if (etapaParticulas && etapaParticulas.estado !== "completada") {
      alert("Error: La revisión de partículas visibles debe estar completada.");
      return;
    }

    setShowConfirmModal(true);
  }

  /* ===========================================================
      EJECUTAR LA ACCIÓN (Llamado desde el modal)
  ============================================================ */
  async function confirmarEnvioPT() {
    setLoadingAction(true);
    const fechaHoy = new Date().toISOString().slice(0, 10);
    const update = {
      fecha_fin_acondicionamiento: fechaHoy,
      estado_id: 10, // Liberación PT
      asignado_a: "control_calidad",
    };

    const { error } = await supabase
      .from("pedidos_produccion")
      .update(update)
      .eq("id", selected.id);

    if (error) {
      console.error("❌ Error finalizando acondicionamiento:", error);
      alert("Error guardando etapa.");
      setLoadingAction(false);
      return;
    }

    // 🔔 NOTIFICAR A CONTROL DE CALIDAD
    try {
      const { notifyRoles } = await import("../api/notifications");
      // Enviamos a ambas variantes por si en BD está como 'controlcalidad' o 'control_calidad'
      await notifyRoles(
        ["control_calidad", "controlcalidad"],
        "Liberación PT Requerida",
        `Acondicionamiento finalizado para Pedido #${selected.id}. Pendiente liberación PT.`,
        selected.id,
        "accion_requerida"
      );
    } catch (errNotif) {
      console.error("Error notificando a calidad:", errNotif);
    }

    alert("✔ Acondicionamiento finalizado. Enviado a Control de Calidad.");
    await loadPedidos();
    setSelected(null);
    setObs([]);
    setShowConfirmModal(false);
    setLoadingAction(false);
  }

  /* ===========================================================
      HISTORIAL ACONDICIONAMIENTO
  ============================================================ */
  function renderHistorial() {
    if (!selected) return null;

    const eventos = [];

    if (selected.fecha_inicio_acondicionamiento) {
      eventos.push({
        fecha: selected.fecha_inicio_acondicionamiento,
        titulo: "Inicio de acondicionamiento",
      });
    }

    if (selected.fecha_fin_acondicionamiento) {
      eventos.push({
        fecha: selected.fecha_fin_acondicionamiento,
        titulo: "Fin de acondicionamiento",
      });
    }

    if (selected.fecha_liberacion_pt) {
      eventos.push({
        fecha: selected.fecha_liberacion_pt,
        titulo: "Liberación de Producto Terminado",
      });
    }

    if (!eventos.length) {
      return (
        <p className="pc-empty">
          Aún no hay historial de acondicionamiento para este pedido.
        </p>
      );
    }

    eventos.sort((a, b) => (a.fecha > b.fecha ? 1 : -1));

    return eventos.map((ev, i) => (
      <div key={i} className="pc-hist-item">
        <p className="pc-hist-fecha">{ev.fecha}</p>
        <p className="pc-hist-titulo">{ev.titulo}</p>
      </div>
    ));
  }

  /* ===========================================================
      FORMULARIO
  ============================================================ */
  function renderEtapa() {
    if (!selected) return null;

    const e = selected.estado_id;

    if (e !== 8 && e !== 9) {
      return (
        <div className="pc-box">
          <p>No hay acciones disponibles para esta etapa.</p>
        </div>
      );
    }

    // ESTADO 8: solo botón simple
    if (e === 8) {
      return (
        <div className="pc-box">
          <h4>{selected.estados?.nombre}</h4>
          <p>
            Al guardar, se registrará la{" "}
            <strong>Fecha inicio de acondicionamiento</strong> con la fecha de
            hoy.
          </p>
          <button className="pc-btn" onClick={avanzarAcondicionamiento}>
            Guardar etapa
          </button>
        </div>
      );
    }

    // ESTADO 9: Confirmación para enviar a Liberación PT
    if (e === 9) {
      return (
        <div className="pc-box">
          <h4>{selected.estados?.nombre}</h4>

          <p>
            Al finalizar acondicionamiento se registró la{" "}
            <strong>Fecha fin de acondicionamiento</strong>.
          </p>

          <p style={{ marginTop: 16, marginBottom: 16 }}>
            Para continuar, el pedido debe pasar por validación de <strong>Control de Calidad</strong>.
          </p>

          <button
            className="pc-btn"
            style={{ background: "var(--accent-primary)" }}
            onClick={solicitarConfirmacion}
          >
            Finalizar acondicionamiento y enviar a Liberación PT
          </button>
        </div>
      );
    }

    return null;
  }

  /* ===========================================================
      RENDER PRINCIPAL
  ============================================================ */
  return (
    <>
      <Navbar />

      <div className="pc-wrapper">
        {/* LISTA IZQUIERDA */}
        <div className="pc-list">
          <h2>🧪 Acondicionamiento</h2>

          {pedidos.length === 0 && (
            <p className="pc-empty">No hay pedidos asignados.</p>
          )}

          {pedidos.map((p) => (
            <div
              key={p.id}
              className={`pc-item ${selected?.id === p.id ? "pc-item-selected" : ""
                }`}
              onClick={() => seleccionarPedido(p)}
            >
              <span className="pc-id-tag">#{p.id}</span>

              <h4>{p.productos?.articulo}</h4>
              <p>
                <strong>Cliente:</strong> {p.clientes?.nombre}
              </p>
              <p>
                <strong>Cantidad:</strong> {p.cantidad}
              </p>
              <p>
                <strong>Estado:</strong>{" "}
                <span className={`pc-chip estado-${p.estado_id}`}>
                  {p.estados?.nombre}
                </span>
              </p>
            </div>
          ))}
        </div>

        {/* DETALLE */}
        {selected && (
          <div className="pc-detail fadeIn">
            <h3>📄 Detalle del Pedido</h3>

            <div className="pc-detail-grid">
              <p>
                <strong>Producto:</strong> {selected.productos?.articulo}
              </p>
              <p>
                <strong>Cliente:</strong> {selected.clientes?.nombre}
              </p>
              <p>
                <strong>Cantidad:</strong> {selected.cantidad}
              </p>
              <p>
                <strong>Estado:</strong>{" "}
                <span className={`pc-chip estado-${selected.estado_id}`}>
                  {selected.estados?.nombre}
                </span>
              </p>
            </div>

            {/* NUEVO: Panel de Revisión de Partículas Visibles */}
            {etapaParticulas && etapaParticulas.estado !== "completada" && (
              <div className="pc-box" style={{ borderLeft: '4px solid #f59e0b', background: '#fffbeb', marginBottom: '20px' }}>
                <h4 style={{ color: '#92400e' }}>🔍 Revisión de Partículas Visibles Pendiente</h4>
                <p style={{ fontSize: '13px', color: '#b45309', marginBottom: '15px' }}>
                  Este es un producto de <strong>Soluciones Estériles</strong>. Debe realizar y registrar la revisión de partículas antes de proceder con el acondicionamiento.
                </p>
                <button 
                  className="pc-btn" 
                  style={{ background: '#f59e0b' }} 
                  onClick={liberarParticulas}
                  disabled={loadingAction}
                >
                  {loadingAction ? "Procesando..." : "✔ Confirmar Revisión de Partículas"}
                </button>
              </div>
            )}

            {renderEtapa()}

            {/* OBSERVACIONES */}
            <h3 style={{ marginTop: 20 }}>📝 Observaciones</h3>
            <div className="pc-observaciones">
              {obs.length === 0 && (
                <p className="pc-empty">No hay observaciones aún.</p>
              )}
              {obs.map((o) => (
                <div key={o.id} className="pc-obs-item">
                  <p>{o.observacion}</p>
                  <span>
                    {o.usuario} –{" "}
                    {new Date(o.created_at).toLocaleString("es-CO")}
                  </span>
                </div>
              ))}
            </div>

            <div className="pc-add-obs">
              <textarea
                rows="2"
                placeholder="+ Añadir observación…"
                value={newObs}
                onChange={(e) => setNewObs(e.target.value)}
              />
              <button onClick={addObs}>➕ Agregar</button>
            </div>

            {/* HISTORIAL ACONDICIONAMIENTO */}
            <h3 style={{ marginTop: 35 }}>📚 Historial de Acondicionamiento</h3>
            <div className="pc-historial">{renderHistorial()}</div>
          </div>
        )}
      </div>
      {/* =============================
          🟦 HISTORIAL ACONDICIONAMIENTO
      ============================== */}
      <div className="gc-history">
        <h2>📜 Historial de Acondicionamiento</h2>

        <input
          className="gc-input"
          placeholder="Buscar por producto o cliente…"
          value={busqueda}
          onChange={(e) => {
            setPagina(1);
            setBusqueda(e.target.value);
          }}
        />

        {lista.length === 0 && (
          <p className="gc-empty">No hay registros de acondicionamiento.</p>
        )}

        {lista.length > 0 && (
          <>
            <table className="gc-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cliente</th>
                  <th>Cantidad</th>
                  <th>Fin Acond.</th>
                </tr>
              </thead>

              <tbody>
                {lista.map((h) => (
                  <tr key={h.id}>
                    <td>{h.productos?.articulo}</td>
                    <td>{h.clientes?.nombre}</td>
                    <td>{h.cantidad}</td>
                    <td>
                      {new Date(h.fecha_fin_acondicionamiento).toLocaleDateString(
                        "es-CO"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* PAGINACIÓN */}
            <div className="gc-paginacion">
              <button
                disabled={pagina === 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                ◀ Anterior
              </button>

              <span>
                Página {pagina} de {paginas}
              </span>

              <button
                disabled={pagina === paginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente ▶
              </button>
            </div>
          </>
        )}
      </div>

      <Footer />

      {/* ==========================
          MODAL CONFIRMACIÓN
         ========================== */}
      {showConfirmModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>🔒 Confirmar Envío a Calidad</h3>
            <p style={{ marginTop: 10, color: "var(--text-main)" }}>
              ¿Estás seguro de que deseas finalizar la etapa de acondicionamiento y enviar este pedido a <strong>Liberación de Producto Terminado</strong>?
            </p>

            <div style={{
              background: "var(--bg-app)",
              padding: "10px",
              borderRadius: "6px",
              marginTop: "12px",
              fontSize: "13px",
              color: "var(--text-main)",
              borderLeft: "4px solid var(--accent-primary)"
            }}>
              ℹ️ Una vez enviado, el pedido pasará a responsabilidad de <strong>Control de Calidad</strong>.
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button
                className="pc-btn"
                style={{ background: "var(--text-sub)" }}
                onClick={() => setShowConfirmModal(false)}
                disabled={loadingAction}
              >
                Cancelar
              </button>
              <button
                className="pc-btn"
                style={{ background: "var(--accent-primary)" }}
                onClick={confirmarEnvioPT}
                disabled={loadingAction}
              >
                {loadingAction ? "Procesando..." : "Sí, enviar a Calidad"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
