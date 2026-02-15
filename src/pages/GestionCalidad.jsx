// src/pages/GestionCalidad.jsx
import React, { useEffect, useState } from "react";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import { supabase } from "../api/supabaseClient";
import { useAuth } from "../context/AuthContext";
import "./GestionCalidad.css";

export default function GestionCalidad() {
  const { usuarioActual } = useAuth();

  const [solicitudes, setSolicitudes] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");

  // filtros historial
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroArea, setFiltroArea] = useState("");
  const [pagina, setPagina] = useState(1);
  const ITEMS_POR_PAGINA = 8;

  // ======================================================
  // CARGAR SOLICITUDES PARA COMPRAS:
  // Estado 1 (Pendiente) + Estado 17 (RevisiónCompras)
  // ======================================================
 async function loadSolicitudes() {
  const { data, error } = await supabase
    .from("solicitudes")
    .select(`
      *,
      tipos_solicitud ( nombre ),
      prioridades ( nombre ),
      estados ( nombre ),
      areas ( nombre )
    `)
    .eq("area_id", 4)
    .eq("estado_id", 1)  // SOLO pendientes, NO 17
    .order("id", { ascending: false });

  if (!error) setSolicitudes(data || []);
}


  // ======================================================
  // CARGAR HISTORIAL (radicados con consecutivo)
  // ======================================================
  async function loadHistorial() {
    const { data, error } = await supabase
      .from("solicitudes")
      .select(`
        id,
        consecutivo,
        created_at,
        area_solicitante,
        usuario_id,
        tipos_solicitud ( nombre )
      `)
      .eq("area_id", 4)
      .not("consecutivo", "is", null)
      .order("consecutivo", { ascending: false });

    if (!error) setHistorial(data || []);
  }

  useEffect(() => {
    loadSolicitudes();
    loadHistorial();
  }, []);

  // ======================================================
  // GENERAR CONSECUTIVO POR ÁREA
  // ======================================================
  async function asignarConsecutivo() {
    if (!selected) return;

    setError("");

    // último consecutivo del área
    const { data: ultimo } = await supabase
      .from("solicitudes")
      .select("consecutivo")
      .eq("area_id", selected.area_id)
      .not("consecutivo", "is", null)
      .order("consecutivo", { ascending: false })
      .limit(1);

    const nuevoConsecutivo =
      ultimo && ultimo.length > 0
        ? (Number(ultimo[0].consecutivo) || 0) + 1
        : 1;

    const { error: errUpd } = await supabase
      .from("solicitudes")
      .update({
        consecutivo: nuevoConsecutivo,
        estado_id: 17, //compras
        accion_realizada: `Consecutivo asignado: ${nuevoConsecutivo}`,
      })
      .eq("id", selected.id);

    if (errUpd) {
      setError("Error asignando consecutivo.");
      console.error(errUpd);
      return;
    }

    setSelected(null);
    await loadSolicitudes();
    await loadHistorial();
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
          <h2>🧪 Gestión de Calidad</h2>
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

            <button className="gc-btn" onClick={asignarConsecutivo}>
              Asignar consecutivo automático
            </button>
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
