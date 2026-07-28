// src/pages/GestionCalidad.jsx
import React, { useEffect, useState } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase, st, ss } from "../api/supabaseClient";
import { useAuth } from "../context/AuthContext";
import "./GestionCalidad.css";

export default function GestionCalidad() {
  const { usuarioActual } = useAuth();

  const [solicitudes, setSolicitudes] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [mensajeExito, setMensajeExito] = useState("");

  // filtros historial
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroArea, setFiltroArea] = useState("");
  const [manualConsec, setManualConsec] = useState("");
  const [pagina, setPagina] = useState(1);
  const ITEMS_POR_PAGINA = 8;

  // ======================================================
  // CARGAR SOLICITUDES PARA COMPRAS:
  // Estado 1 (Pendiente) + Estado 17 (RevisiónCompras)
  // ======================================================
  async function loadSolicitudes() {
    try {
      const [
        { data: solRaw, error: solErr },
        { data: tiposRaw },
        { data: prioRaw },
        { data: estRaw },
        { data: arsRaw }
      ] = await Promise.all([
        supabase
          .from(st("solicitudes"))
          .select(ss(`
            *,
            compras_solicitudes_detalle!inner(solicitud_id)
          `))
          .eq("estado_id", 1)  // SOLO pendientes, NO 17
          .order("id", { ascending: false }),
        supabase.from(st("tipos_solicitud")).select("*"),
        supabase.from(st("prioridades")).select("*"),
        supabase.from(st("estados")).select("*"),
        supabase.from(st("areas")).select("*")
      ]);

      if (solErr) throw solErr;

      const tMap = new Map(tiposRaw?.map(t => [t.id, t]));
      const pMap = new Map(prioRaw?.map(p => [p.id, p]));
      const eMap = new Map(estRaw?.map(e => [e.id, e]));
      const aMap = new Map(arsRaw?.map(a => [a.id, a]));

      const hydrated = (solRaw || []).map(s => ({
        ...s,
        tipos_solicitud: tMap.get(s.tipo_solicitud_id),
        prioridades: pMap.get(s.prioridad_id),
        estados: eMap.get(s.estado_id),
        areas: aMap.get(s.area_id)
      }));

      setSolicitudes(hydrated);
    } catch (err) {
      console.error("Error cargando solicitudes (Calidad):", err);
      setSolicitudes([]);
    }
  }


  // ======================================================
  // CARGAR HISTORIAL (radicados con consecutivo)
  // ======================================================
  async function loadHistorial() {
    try {
      const [
        { data: histRaw, error: histErr },
        { data: tiposRaw }
      ] = await Promise.all([
        supabase
          .from(st("solicitudes"))
          .select(ss(`
            id,
            consecutivo,
            created_at,
            area_solicitante,
            usuario_id,
            tipo_solicitud_id,
            compras_solicitudes_detalle!inner(solicitud_id)
          `))
          .not("consecutivo", "is", null)
          .order("id", { ascending: false }),
        supabase.from(st("tipos_solicitud")).select("*")
      ]);

      if (histErr) throw histErr;

      const tMap = new Map(tiposRaw?.map(t => [t.id, t]));

      const hydrated = (histRaw || []).map(h => ({
        ...h,
        tipos_solicitud: tMap.get(h.tipo_solicitud_id)
      }));

      setHistorial(hydrated);
    } catch (err) {
      console.error("Error cargando historial (Calidad):", err);
      setHistorial([]);
    }
  }

  useEffect(() => {
    loadSolicitudes();
    loadHistorial();
  }, []);

  // ======================================================
  // ASIGNAR CONSECUTIVO AUTOMATICO O MANUAL
  // ======================================================
  async function asignarConsecutivo(esManual = false) {
    if (!selected) return;
    setError("");
    setMensajeExito("");

    try {
      // Obtener el ID de auth.users real
      const { data: authData } = await supabase.auth.getUser();
      const realUserId = authData?.user?.id || null;

      if (esManual) {
        if (!manualConsec || isNaN(manualConsec) || Number(manualConsec) <= 0) {
          setError("El consecutivo manual debe ser un número válido mayor a 0.");
          return;
        }

        // Verificar que no exista ya
        const { data: existe, error: errExiste } = await supabase
          .from(st("solicitudes"))
          .select("id")
          .eq("consecutivo", Number(manualConsec))
          .limit(1);

        if (errExiste) throw errExiste;

        if (existe && existe.length > 0) {
          setError(`El consecutivo ${manualConsec} ya existe. Por favor usa otro.`);
          return;
        }

        // Asignar manual (update solicitudes)
        const { error: updError } = await supabase
          .from(st("solicitudes"))
          .update({
            consecutivo: Number(manualConsec),
            estado_id: 17 // Pasa a estado "RevisiónCompras"
          })
          .eq("id", selected.id);

        if (updError) throw updError;
        
        // Asignar manual (update compras_solicitudes_detalle)
        const v_anio = new Date().getFullYear();
        const v_consecutivo_oficial = String(manualConsec).padStart(3, '0');
        
        const { error: detError } = await supabase
          .from("compras_solicitudes_detalle")
          .upsert({
            solicitud_id: selected.id,
            estado_compra: 'REVISION_COMPRAS',
            consecutivo_numero: Number(manualConsec),
            consecutivo_anio: v_anio,
            consecutivo_oficial: v_consecutivo_oficial,
            consecutivo_asignado_por: realUserId,
            tipo_requisicion: 'MATERIAL'
          }, { onConflict: 'solicitud_id' });
          
        if (detError) throw detError;
        
        // Evento manual
        await supabase.from("compras_eventos").insert([{
          solicitud_id: selected.id,
          tipo_evento: "CONSECUTIVO_ASIGNADO",
          estado_anterior: "PENDIENTE",
          estado_nuevo: "REVISION_COMPRAS",
          actor_id: realUserId,
          comentario: `Radicado Manual ${v_consecutivo_oficial}`
        }]);

        setMensajeExito(`¡Consecutivo manual ${manualConsec} asignado con éxito!`);
        setManualConsec("");
      } else {
        // Asignar automático mediante RPC
        const { data, error: errRpc } = await supabase.rpc("rpc_compras_asignar_consecutivo", {
          p_solicitud_id: selected.id,
          p_actor_id: realUserId
        });

        if (errRpc) throw errRpc;
        setMensajeExito(`¡Consecutivo automático asignado con éxito! Número: ${data?.consecutivo}`);
      }

      setTimeout(() => setMensajeExito(""), 5000);
      setSelected(null);
      await loadSolicitudes();
      await loadHistorial();
    } catch (err) {
      console.error("Error al asignar consecutivo:", err);
      setError(`Error al asignar consecutivo: ${err.message}`);
    }
  }

  // ======================================================
  // HISTORIAL FILTRADO Y PAGINADO
  // ======================================================
  const historialFiltrado = historial
    .filter((h) =>
      `${h.consecutivo} ${h.tipos_solicitud?.nombre} ${h.area_solicitante} ${h.usuario_id}`
        .toLowerCase()
        .includes(busqueda.toLowerCase())
    )
    .filter((h) => (filtroTipo ? h.tipos_solicitud?.nombre === filtroTipo : true))
    .filter((h) => (filtroArea ? h.area_solicitante === filtroArea : true));

  const totalPaginas = Math.ceil(historialFiltrado.length / ITEMS_POR_PAGINA) || 1;
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * ITEMS_POR_PAGINA;
  const historialPaginado = historialFiltrado.slice(
    inicio,
    inicio + ITEMS_POR_PAGINA
  );

  // ======================================================
  // RENDER
  // ======================================================
  return (
    <>
      <Navbar />

      <div className="gc-wrapper">
        {/* LISTA IZQUIERDA */}
        <div className="gc-list">
          <h2>🧪 Aseguramiento de Calidad</h2>
          <p className="gc-subtitle">
            Asignación de consecutivo para solicitudes dirigidas a Compras.
          </p>

          {solicitudes.length === 0 && (
            <p className="gc-empty">
              No hay solicitudes pendientes o en revisión.
            </p>
          )}

          {solicitudes.map((s) => (
            <div
              key={s.id}
              className={`gc-item ${selected?.id === s.id ? "gc-selected" : ""}`}
              onClick={() => setSelected(s)}
            >
              <span className="gc-consec-chip">
                {s.consecutivo ? `Cons. ${s.consecutivo}` : "Sin consecutivo"}
              </span>

              <h4>{s.tipos_solicitud?.nombre}</h4>

              <p>
                <strong>Prioridad:</strong> {s.prioridades?.nombre}
              </p>
              <p>
                <strong>Usuario solicitante:</strong> {s.usuario_id}
              </p>
              <p>
                <strong>Área solicitante:</strong> {s.area_solicitante}
              </p>
            </div>
          ))}
        </div>

        {/* DETALLE DERECHA */}
        {selected && (
          <div className="gc-detail fadeIn">
            <h3>📄 Detalle de la Solicitud</h3>

            <div className="gc-grid">
              <p>
                <strong>Consecutivo:</strong>{" "}
                {selected.consecutivo ?? "Sin asignar"}
              </p>
              <p>
                <strong>Tipo:</strong> {selected.tipos_solicitud?.nombre}
              </p>
              <p>
                <strong>Área destino:</strong> {selected.areas?.nombre}
              </p>
              <p>
                <strong>Prioridad:</strong> {selected.prioridades?.nombre}
              </p>
              <p>
                <strong>Usuario solicitante:</strong> {selected.usuario_id}
              </p>
              <p>
                <strong>Área solicitante:</strong> {selected.area_solicitante}
              </p>
            </div>

            <h4>Descripción</h4>
            <p className="gc-box">{selected.descripcion}</p>

            <h4>Justificación</h4>
            <p className="gc-box">{selected.justificacion || "No aplica"}</p>

            {error && <p className="gc-error">{error}</p>}
            {mensajeExito && <p className="gc-success" style={{ color: "green", background: "#ecfdf5", padding: "10px", borderRadius: "8px", border: "1px solid #10b981" }}>{mensajeExito}</p>}

            <div style={{ display: "flex", gap: "10px", marginTop: "15px", alignItems: "center" }}>
              <button className="gc-btn" onClick={() => asignarConsecutivo(false)}>
                Asignar automático
              </button>
              
              <div style={{ display: "flex", gap: "5px", alignItems: "center", marginLeft: "auto" }}>
                <input 
                  type="number"
                  className="gc-input"
                  placeholder="Cons. Manual..."
                  value={manualConsec}
                  onChange={(e) => setManualConsec(e.target.value)}
                  style={{ width: "130px", marginTop: "0" }}
                />
                <button 
                  className="gc-btn" 
                  style={{ background: "#475569" }}
                  onClick={() => asignarConsecutivo(true)}
                >
                  Asignar manual
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* HISTORIAL */}
      <div className="gc-history">
        <h2>📜 Historial de radicados</h2>

        {/* Filtros */}
        <div className="gc-filtros">
          <input
            className="gc-input"
            placeholder="Buscar por consecutivo, tipo, área o usuario…"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(1);
            }}
          />

          <select
            value={filtroTipo}
            onChange={(e) => {
              setFiltroTipo(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Tipo (Todos)</option>
            {[...new Set(historial.map((h) => h.tipos_solicitud?.nombre))]
              .filter(Boolean)
              .map((t) => (
                <option key={t}>{t}</option>
              ))}
          </select>

          <select
            value={filtroArea}
            onChange={(e) => {
              setFiltroArea(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Área solicitante (Todas)</option>
            {[...new Set(historial.map((h) => h.area_solicitante))]
              .filter(Boolean)
              .map((a) => (
                <option key={a}>{a}</option>
              ))}
          </select>
        </div>

        {historialPaginado.length === 0 && (
          <p className="gc-empty">No hay radicados que coincidan.</p>
        )}

        {historialPaginado.length > 0 && (
          <>
            <table className="gc-table">
              <thead>
                <tr>
                  <th>Consecutivo</th>
                  <th>Tipo</th>
                  <th>Usuario solicitante</th>
                  <th>Área solicitante</th>
                  <th>Fecha creación</th>
                </tr>
              </thead>

              <tbody>
                {historialPaginado.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <strong>{h.consecutivo}</strong>
                    </td>
                    <td>{h.tipos_solicitud?.nombre}</td>
                    <td>{h.usuario_id}</td>
                    <td>{h.area_solicitante}</td>
                    <td>{new Date(h.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* PAGINACIÓN */}
            <div className="gc-paginacion">
              <button
                disabled={paginaSegura === 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
              >
                ◀ Anterior
              </button>

              <span>
                Página {paginaSegura} de {totalPaginas}
              </span>

              <button
                disabled={paginaSegura === totalPaginas}
                onClick={() =>
                  setPagina((p) => Math.min(totalPaginas, p + 1))
                }
              >
                Siguiente ▶
              </button>
            </div>
          </>
        )}
      </div>

      <Footer />
    </>
  );
}
