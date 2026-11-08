import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useConfig } from "../context/ConfigContext";
import { supabase, st } from "../api/supabaseClient";
import {
  GRUPOS_CAPACITACION,
  BENEFICIOS_VIRTUAL,
  TARIFAS,
  TOTAL_COLABORADORES,
  TOTAL_SESIONES,
  getHorariosValidosPorDia,
  getFechasHabilitadasNoviembre2026
} from "../constants/capacitaciones";
import "./Capacitaciones.css";

const LOGO_GUSING = "https://gqspcolombia.org/wp-content/uploads/2025/09/21.png";
const ADMIN_PIN = "gusing2026";

export default function Capacitaciones() {
  const { usuarioActual } = useAuth();
  const { isNoOficial } = useConfig();

  // Estados principales
  const [activeTab, setActiveTab] = useState("beneficios"); // "beneficios" | "agendar" | "admin"
  const [reservas, setReservas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensajeError, setMensajeError] = useState("");

  // Estado de desbloqueo de panel de control (público con PIN o por rol admin)
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(() => {
    return (
      sessionStorage.getItem("cap_admin_unlocked") === "true" ||
      ["gerencia", "mantenimiento", "garantiacalidad", "direcciontecnica"].includes(
        usuarioActual?.rol
      )
    );
  });
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  // Estado del formulario de agendamiento
  const [selectedGrupoId, setSelectedGrupoId] = useState(null);
  const [responsableNombre, setResponsableNombre] = useState(usuarioActual?.usuario || "");
  const [responsableEmail, setResponsableEmail] = useState(usuarioActual?.correo || "");
  const [selectedFecha, setSelectedFecha] = useState("2026-11-11");
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Modal de confirmación exitosa
  const [reservaExitosa, setReservaExitosa] = useState(null);
  const [copiadoWhatsapp, setCopiadoWhatsapp] = useState(false);

  // Estados de edición administrativa
  const [reprogramandoReserva, setReprogramandoReserva] = useState(null);
  const [nuevaFechaReprog, setNuevaFechaReprog] = useState("2026-11-11");
  const [nuevoSlotReprog, setNuevoSlotReprog] = useState(null);
  const [teamsInputs, setTeamsInputs] = useState({});

  // Fechas habilitadas en Noviembre de 2026
  const fechasHabilitadas = useMemo(() => getFechasHabilitadasNoviembre2026(), []);

  // Cargar reservas desde la base de datos
  const cargarReservas = useCallback(async () => {
    try {
      setCargando(true);
      const tableName = st("capacitaciones");
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .order("fecha", { ascending: true })
        .order("hora_inicio", { ascending: true });

      if (error) {
        console.error("Error al cargar capacitaciones:", error);
      } else {
        setReservas(data || []);
      }
    } catch (err) {
      console.error("Error inesperado cargando capacitaciones:", err);
    } finally {
      setCargando(false);
    }
  }, [isNoOficial]);

  useEffect(() => {
    cargarReservas();
  }, [cargarReservas]);

  // Si el usuario cambia o se carga tarde, sincronizar responsable
  useEffect(() => {
    if (usuarioActual) {
      if (!responsableNombre) setResponsableNombre(usuarioActual.usuario || "");
      if (!responsableEmail) setResponsableEmail(usuarioActual.correo || "");
    }
  }, [usuarioActual]);

  // Mapa de reservas activas (no canceladas) por grupo
  const reservasPorGrupo = useMemo(() => {
    const mapa = {};
    reservas.forEach((r) => {
      if (r.estado !== "cancelada") {
        mapa[r.grupo_id] = r;
      }
    });
    return mapa;
  }, [reservas]);

  // Mapa de horarios ocupados por fecha y slot: "YYYY-MM-DD|hora_slot"
  const slotsOcupadosMap = useMemo(() => {
    const mapa = {};
    reservas.forEach((r) => {
      if (r.estado !== "cancelada") {
        const key = `${r.fecha}|${r.hora_slot}`;
        mapa[key] = r;
      }
    });
    return mapa;
  }, [reservas]);

  // Horarios para la fecha seleccionada
  const slotsParaFechaSeleccionada = useMemo(() => {
    if (!selectedFecha) return [];
    return getHorariosValidosPorDia(selectedFecha);
  }, [selectedFecha]);

  // Grupo seleccionado
  const grupoSeleccionadoObj = useMemo(() => {
    return GRUPOS_CAPACITACION.find((g) => g.id === selectedGrupoId) || null;
  }, [selectedGrupoId]);

  // Validar si el grupo seleccionado ya tiene reserva activa
  const grupoYaTieneReserva = useMemo(() => {
    if (!selectedGrupoId) return null;
    return reservasPorGrupo[selectedGrupoId] || null;
  }, [selectedGrupoId, reservasPorGrupo]);

  // Manejar creación de reserva
  const handleCrearReserva = async (e) => {
    e.preventDefault();
    setMensajeError("");

    if (!selectedGrupoId) {
      setMensajeError("Por favor selecciona un grupo para la capacitación.");
      return;
    }
    if (!responsableNombre.trim()) {
      setMensajeError("Por favor ingresa el nombre de la persona responsable.");
      return;
    }
    if (!responsableEmail.trim()) {
      setMensajeError("Por favor ingresa el correo electrónico de contacto.");
      return;
    }
    if (!selectedFecha) {
      setMensajeError("Por favor selecciona una fecha disponible.");
      return;
    }
    if (!selectedSlot) {
      setMensajeError("Por favor selecciona un horario disponible.");
      return;
    }

    // Verificar si el grupo ya tiene una reserva activa
    if (grupoYaTieneReserva) {
      setMensajeError(
        `El grupo "${grupoSeleccionadoObj.nombre}" ya tiene una capacitación agendada el ${grupoYaTieneReserva.fecha} (${grupoYaTieneReserva.hora_slot}). Cancela o reprograma la existente si necesitas cambiarla.`
      );
      return;
    }

    // Verificar si el horario fue tomado en el intertanto
    const keySlot = `${selectedFecha}|${selectedSlot.label}`;
    if (slotsOcupadosMap[keySlot]) {
      setMensajeError(
        `El horario ${selectedSlot.label} del ${selectedFecha} ya ha sido reservado por otro grupo. Por favor selecciona otra franja.`
      );
      return;
    }

    try {
      setGuardando(true);
      const codigo = `CAP-${String(reservas.length + 1).padStart(3, "0")}`;

      const nuevoRegistro = {
        codigo_reserva: codigo,
        grupo_id: grupoSeleccionadoObj.id,
        grupo_nombre: grupoSeleccionadoObj.nombre,
        participantes_count: grupoSeleccionadoObj.participantes,
        responsable_nombre: responsableNombre.trim(),
        responsable_email: responsableEmail.trim(),
        fecha: selectedFecha,
        hora_inicio: selectedSlot.hora_inicio,
        hora_fin: selectedSlot.hora_fin,
        hora_slot: selectedSlot.label,
        modalidad: "Virtual",
        precio_cop: 400000,
        estado: "programada",
        teams_link: null,
        observaciones: `Agendado por ${responsableNombre.trim()}`
      };

      const tableName = st("capacitaciones");
      const { data, error } = await supabase
        .from(tableName)
        .insert([nuevoRegistro])
        .select();

      if (error) {
        throw error;
      }

      const guardado = data?.[0] || nuevoRegistro;
      setReservaExitosa(guardado);
      await cargarReservas();

      // Reset selección
      setSelectedGrupoId(null);
      setSelectedSlot(null);
    } catch (err) {
      console.error("Error guardando reserva:", err);
      setMensajeError(err.message || "Ocurrió un error al guardar la reserva. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  // Generar y copiar texto para WhatsApp
  const handleCopiarWhatsApp = (reserva) => {
    if (!reserva) return;
    const texto = `🎓 *CONFIRMACIÓN DE CAPACITACIÓN VIRTUAL*
*Laboratorios Gusing S.A.S.*
Programa Microsoft Office & OneDrive
----------------------------------------
📌 *Reserva:* ${reserva.codigo_reserva || "CAP-001"}
👥 *Grupo:* ${reserva.grupo_nombre} (${reserva.participantes_count || 5} personas)
📅 *Fecha:* ${reserva.fecha}
⏰ *Horario:* ${reserva.hora_slot} (90 min)
💻 *Modalidad:* Virtual (Microsoft Teams)
👤 *Responsable:* ${reserva.responsable_nombre}
✉️ *Contacto:* ${reserva.responsable_email}
${reserva.teams_link ? `🔗 *Enlace Teams:* ${reserva.teams_link}` : ""}
----------------------------------------
¡Nos vemos conectados en la sesión!`;

    navigator.clipboard.writeText(texto).then(() => {
      setCopiadoWhatsapp(true);
      setTimeout(() => setCopiadoWhatsapp(false), 3000);
    });
  };

  // Acciones administrativas
  const handleCambiarEstado = async (id, nuevoEstado) => {
    try {
      const tableName = st("capacitaciones");
      const { error } = await supabase
        .from(tableName)
        .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      await cargarReservas();
    } catch (err) {
      alert("Error al actualizar estado: " + err.message);
    }
  };

  const handleGuardarTeamsLink = async (id) => {
    const link = teamsInputs[id];
    try {
      const tableName = st("capacitaciones");
      const { error } = await supabase
        .from(tableName)
        .update({ teams_link: link, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      alert("Enlace de Microsoft Teams guardado correctamente.");
      await cargarReservas();
    } catch (err) {
      alert("Error al guardar enlace: " + err.message);
    }
  };

  const handleCancelarReserva = async (id, grupoNombre) => {
    if (
      !window.confirm(
        `¿Seguro que deseas cancelar la reserva del grupo "${grupoNombre}"? El horario quedará libre para agendar nuevamente.`
      )
    ) {
      return;
    }

    try {
      const tableName = st("capacitaciones");
      const { error } = await supabase
        .from(tableName)
        .update({ estado: "cancelada", updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      await cargarReservas();
    } catch (err) {
      alert("Error al cancelar reserva: " + err.message);
    }
  };

  const handleEjecutarReprogramacion = async () => {
    if (!reprogramandoReserva || !nuevaFechaReprog || !nuevoSlotReprog) {
      alert("Por favor selecciona una nueva fecha y horario disponible.");
      return;
    }

    const keySlot = `${nuevaFechaReprog}|${nuevoSlotReprog.label}`;
    const ocupadoPor = slotsOcupadosMap[keySlot];
    if (ocupadoPor && ocupadoPor.id !== reprogramandoReserva.id) {
      alert(`El horario ${nuevoSlotReprog.label} ya está ocupado por otro grupo.`);
      return;
    }

    try {
      const tableName = st("capacitaciones");
      const { error } = await supabase
        .from(tableName)
        .update({
          fecha: nuevaFechaReprog,
          hora_inicio: nuevoSlotReprog.hora_inicio,
          hora_fin: nuevoSlotReprog.hora_fin,
          hora_slot: nuevoSlotReprog.label,
          estado: "programada",
          updated_at: new Date().toISOString()
        })
        .eq("id", reprogramandoReserva.id);

      if (error) throw error;

      alert("Reserva reprogramada exitosamente.");
      setReprogramandoReserva(null);
      setNuevoSlotReprog(null);
      await cargarReservas();
    } catch (err) {
      alert("Error al reprogramar: " + err.message);
    }
  };

  // Contadores administrativos
  const totalProgramadas = useMemo(() => {
    return reservas.filter((r) => r.estado === "programada" || r.estado === "completada").length;
  }, [reservas]);

  const totalPendientes = TOTAL_SESIONES - totalProgramadas;

  return (
    <div className="cap-page-wrapper">
      <div className="cap-page-container">
        {/* BARRA SUPERIOR PÚBLICA (Independiente del Login) */}
        <header className="cap-public-topbar">
          <div className="cap-public-brand">
            <img src={LOGO_GUSING} alt="Laboratorios Gusing" className="cap-public-logo" />
            <div>
              <span className="cap-public-company">Laboratorios Gusing S.A.S.</span>
              <span className="cap-public-portal-tag">Capacitaciones Virtuales</span>
            </div>
          </div>
          <a href="/" className="cap-public-login-link">
            <span>🔐</span> Portal Interno ↗
          </a>
        </header>

        {/* BANNER CORPORATIVO */}
        <section className="cap-hero-banner">
          <div className="cap-brand-row">
            <span className="cap-brand-badge">★ Plan de Formación 2026</span>
            <span
              className="cap-brand-badge"
              style={{
                background: "rgba(255, 255, 255, 0.15)",
                color: "#ffffff",
                borderColor: "rgba(255, 255, 255, 0.35)"
              }}
            >
              6 Sesiones Virtuales
            </span>
          </div>
          <h1 className="cap-hero-title">Capacitación Microsoft Office & OneDrive</h1>
          <p className="cap-hero-subtitle">
            Agendamiento de sesiones grupales interactivas para los 29 colaboradores de Laboratorios
            Gusing S.A.S. Optimizando la productividad y el trabajo colaborativo en la nube.
          </p>
        </section>

        {/* NAVEGACIÓN DE PESTAÑAS (Mobile-First: 3 Columnas) */}
        <nav className="cap-tabs-nav" aria-label="Secciones del módulo">
          <button
            className={`cap-tab-btn ${activeTab === "beneficios" ? "active" : ""}`}
            onClick={() => setActiveTab("beneficios")}
          >
            <span className="cap-tab-icon">📖</span>
            <span className="cap-tab-text-mobile">Tarifas</span>
            <span className="cap-tab-text-desktop">Programa y Tarifas</span>
          </button>
          <button
            className={`cap-tab-btn ${activeTab === "agendar" ? "active" : ""}`}
            onClick={() => setActiveTab("agendar")}
          >
            <span className="cap-tab-icon">📅</span>
            <span className="cap-tab-text-mobile">
              Agendar Virtual {totalPendientes > 0 && `(${totalPendientes})`}
            </span>
            <span className="cap-tab-text-desktop">
              Agendar Capacitación Virtual{" "}
              {totalPendientes > 0 && (
                <span className="cap-tab-badge">{totalPendientes} pendientes</span>
              )}
            </span>
          </button>
          <button
            className={`cap-tab-btn ${activeTab === "admin" ? "active" : ""}`}
            onClick={() => {
              if (isAdminUnlocked) {
                setActiveTab("admin");
              } else {
                setPinInput("");
                setPinError("");
                setShowPinModal(true);
              }
            }}
          >
            <span className="cap-tab-icon">⚙️</span>
            <span className="cap-tab-text-mobile">
              Control ({totalProgramadas}/{TOTAL_SESIONES})
            </span>
            <span className="cap-tab-text-desktop">
              Panel de Control ({totalProgramadas}/{TOTAL_SESIONES})
            </span>
          </button>
        </nav>

        {/* ===================================================================
            TAB 1: PRESENTACIÓN Y BENEFICIOS
           =================================================================== */}
        {activeTab === "beneficios" && (
          <div className="cap-tab-content">
            <div className="cap-section-header">
              <h2 className="cap-section-title">
                <span>🎯</span> Modalidades de Capacitación
              </h2>
              <p className="cap-section-desc">
                Compara las opciones y elige la modalidad más eficiente y flexible para tu equipo.
              </p>
            </div>

            {/* Comparación de Precios y Modalidades */}
            <div className="cap-pricing-grid">
              {/* Tarjeta Principal Destacada: MODALIDAD VIRTUAL */}
              <div className="cap-card-featured">
                <span className="cap-card-tag">Recomendado ★</span>
                <div className="cap-pricing-header">
                  <h3 className="cap-pricing-modalidad">MODALIDAD VIRTUAL</h3>
                  <div className="cap-pricing-price">
                    {TARIFAS.virtual.precioFormateado} <span>/ Programa completo</span>
                  </div>
                </div>

                <ul className="cap-pricing-features">
                  {TARIFAS.virtual.caracteristicas.map((item, idx) => (
                    <li key={idx}>
                      <span className="cap-feature-check">✔</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <button
                  className="cap-btn-cta-large"
                  onClick={() => setActiveTab("agendar")}
                >
                  <span>📅</span> AGENDAR CAPACITACIÓN VIRTUAL
                </button>
              </div>

              {/* Tarjeta Secundaria: MODALIDAD PRESENCIAL */}
              <div className="cap-card-secondary">
                <div className="cap-pricing-header">
                  <h3 className="cap-pricing-modalidad">MODALIDAD PRESENCIAL</h3>
                  <div className="cap-pricing-price">
                    {TARIFAS.presencial.precioFormateado} <span>/ Programa completo</span>
                  </div>
                </div>

                <ul className="cap-pricing-features">
                  {TARIFAS.presencial.caracteristicas.map((item, idx) => (
                    <li key={idx}>
                      <span className="cap-feature-check" style={{ color: "#64748b" }}>
                        •
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <p
                  style={{
                    fontSize: "0.82rem",
                    color: "var(--text-sub)",
                    marginTop: "1.25rem",
                    lineHeight: "1.4"
                  }}
                >
                  * <strong>Nota sobre modalidad presencial:</strong> La alternativa presencial no incluye grabaciones en video y requiere coordinación logística previa. <strong>En la imagen compartida de la propuesta se muestran los horarios presenciales disponibles.</strong> Esta plataforma en línea es exclusiva para el agendamiento de las sesiones virtuales.
                </p>
              </div>
            </div>

            {/* Cuadrícula de Beneficios de la Modalidad Virtual */}
            <div className="cap-section-header" style={{ marginTop: "2.5rem" }}>
              <h2 className="cap-section-title">
                <span>✨</span> ¿Por qué elegir la Modalidad Virtual?
              </h2>
              <p className="cap-section-desc">
                Diseñada para maximizar el aprendizaje práctico sin interrumpir las operaciones de
                laboratorio y planta.
              </p>
            </div>

            <div className="cap-benefits-grid">
              {BENEFICIOS_VIRTUAL.map((b, idx) => (
                <div className="cap-benefit-card" key={idx}>
                  <div className="cap-benefit-icon">{b.icono}</div>
                  <div className="cap-benefit-content">
                    <h4>{b.titulo}</h4>
                    <p>{b.descripcion}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 2: AGENDAMIENTO SENCILLO POR GRUPOS
           =================================================================== */}
        {activeTab === "agendar" && (
          <div className="cap-tab-content">
            <div className="cap-section-header">
              <div className="cap-virtual-tag">
                <span>💻</span> Modalidad 100% Virtual
              </div>
              <h2 className="cap-section-title">
                <span>📅</span> Agendar Capacitación Virtual
              </h2>
              <p className="cap-section-desc">
                Esta agenda es exclusiva para las sesiones virtuales grupales en vivo por Microsoft Teams.
              </p>
            </div>

            {/* Aviso informativo de horarios presenciales */}
            <div className="cap-notice-presencial-box">
              <span className="cap-notice-icon">📋</span>
              <div>
                <strong>Agenda 100% Virtual:</strong> Los cupos y horarios aquí listados son exclusivamente para capacitaciones virtuales. <em>En la imagen compartida de la propuesta se muestran los horarios presenciales disponibles</em> en caso de requerir dicha alternativa.
              </div>
            </div>

            {mensajeError && (
              <div
                style={{
                  background: "#fee2e2",
                  border: "1px solid #ef4444",
                  color: "#b91c1c",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  marginBottom: "1.25rem",
                  fontSize: "0.9rem",
                  fontWeight: "600"
                }}
              >
                ⚠️ {mensajeError}
              </div>
            )}

            <form onSubmit={handleCrearReserva} className="cap-booking-layout">
              {/* COLUMNA 1: GRUPO Y RESPONSABLE */}
              <div className="cap-form-card">
                <h3 className="cap-form-step-title">
                  <span className="cap-step-num">1</span> Seleccionar Grupo o Área
                </h3>

                <div className="cap-groups-grid">
                  {GRUPOS_CAPACITACION.map((grupo) => {
                    const yaAgendado = reservasPorGrupo[grupo.id];
                    const isSelected = selectedGrupoId === grupo.id;

                    return (
                      <div
                        key={grupo.id}
                        className={`cap-group-card ${isSelected ? "selected" : ""} ${
                          yaAgendado ? "booked" : ""
                        }`}
                        onClick={() => {
                          if (!yaAgendado) {
                            setSelectedGrupoId(grupo.id);
                            setMensajeError("");
                          } else {
                            setMensajeError(
                              `El grupo "${grupo.nombre}" ya tiene sesión programada para el ${yaAgendado.fecha} (${yaAgendado.hora_slot}).`
                            );
                          }
                        }}
                      >
                        <div className="cap-group-top">
                          <span style={{ fontSize: "1.2rem" }}>{grupo.icono}</span>
                          <span
                            className={`cap-group-badge ${
                              yaAgendado ? "cap-badge-booked" : "cap-badge-pending"
                            }`}
                          >
                            {yaAgendado ? "✓ Agendado" : `${grupo.participantes} personas`}
                          </span>
                        </div>
                        <h4 className="cap-group-name">{grupo.nombre}</h4>
                        <p className="cap-group-meta">
                          {yaAgendado
                            ? `Fecha: ${yaAgendado.fecha} | ${yaAgendado.hora_slot}`
                            : grupo.descripcion}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <hr style={{ margin: "1.5rem 0", borderColor: "var(--border-color, #e2e8f0)" }} />

                <h3 className="cap-form-step-title">
                  <span className="cap-step-num">2</span> Datos del Responsable
                </h3>

                <div className="cap-input-group">
                  <label className="cap-input-label">Nombre de quien agenda</label>
                  <input
                    type="text"
                    className="cap-input-field"
                    placeholder="Ej: Karen / Responsable de Área"
                    value={responsableNombre}
                    onChange={(e) => setResponsableNombre(e.target.value)}
                    required
                  />
                </div>

                <div className="cap-input-group">
                  <label className="cap-input-label">Correo electrónico de contacto</label>
                  <input
                    type="email"
                    className="cap-input-field"
                    placeholder="correo@gusing.com"
                    value={responsableEmail}
                    onChange={(e) => setResponsableEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* COLUMNA 2: FECHA Y HORARIO */}
              <div className="cap-form-card">
                <h3 className="cap-form-step-title">
                  <span className="cap-step-num">3</span> Fecha Disponible (Noviembre 2026)
                </h3>
                <p style={{ fontSize: "0.82rem", color: "var(--text-sub)", marginTop: "-6px" }}>
                  Disponible miércoles (tarde), jueves y viernes (mañana y tarde) hasta el 27 de
                  noviembre.
                </p>

                {/* Selector Horizontal de Fechas */}
                <div className="cap-dates-scroll">
                  {fechasHabilitadas.map((f) => {
                    const isSelected = selectedFecha === f.fecha;
                    return (
                      <div
                        key={f.fecha}
                        className={`cap-date-card ${isSelected ? "selected" : ""}`}
                        onClick={() => {
                          setSelectedFecha(f.fecha);
                          setSelectedSlot(null);
                        }}
                      >
                        <div className="cap-date-day-name">{f.nombreDia.slice(0, 3)}</div>
                        <div className="cap-date-day-number">{f.diaNumero}</div>
                        <div className="cap-date-month">Nov</div>
                      </div>
                    );
                  })}
                </div>

                <h3 className="cap-form-step-title" style={{ marginTop: "1.5rem" }}>
                  <span className="cap-step-num">4</span> Horario Virtual Disponible (90 minutos)
                </h3>

                {slotsParaFechaSeleccionada.length === 0 ? (
                  <p style={{ color: "var(--text-sub)", fontSize: "0.88rem" }}>
                    No hay horarios disponibles para la fecha seleccionada.
                  </p>
                ) : (
                  <div className="cap-slots-grid">
                    {slotsParaFechaSeleccionada.map((slot) => {
                      const keySlot = `${selectedFecha}|${slot.label}`;
                      const ocupadoPor = slotsOcupadosMap[keySlot];
                      const isSelected = selectedSlot?.id === slot.id;

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={!!ocupadoPor}
                          className={`cap-slot-btn ${isSelected ? "selected" : ""} ${
                            ocupadoPor ? "occupied" : ""
                          }`}
                          onClick={() => setSelectedSlot(slot)}
                        >
                          <div>
                            <div className="cap-slot-time">{slot.label}</div>
                            <div className="cap-slot-shift">Turno {slot.turno}</div>
                          </div>

                          <div>
                            {ocupadoPor ? (
                              <span className="cap-slot-status cap-slot-taken">
                                Ocupado ({ocupadoPor.grupo_nombre?.split(",")[0]})
                              </span>
                            ) : (
                              <span className="cap-slot-status cap-slot-free">Disponible</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Resumen del agendamiento antes de confirmar */}
                {selectedGrupoId && selectedSlot && (
                  <div className="cap-booking-summary-box">
                    <div className="cap-summary-title">
                      <span>📋</span> Resumen de la reserva
                    </div>
                    <div className="cap-summary-line">
                      <strong>Grupo:</strong> {grupoSeleccionadoObj?.nombre}
                    </div>
                    <div className="cap-summary-line">
                      <strong>Participantes:</strong> {grupoSeleccionadoObj?.participantes} colaboradores
                    </div>
                    <div className="cap-summary-line">
                      <strong>Fecha:</strong> {selectedFecha}
                    </div>
                    <div className="cap-summary-line">
                      <strong>Horario:</strong> {selectedSlot?.label} (90 min)
                    </div>
                    <div className="cap-summary-line">
                      <strong>Modalidad:</strong> Virtual (Teams) — $400.000 COP
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={guardando || !selectedGrupoId || !selectedSlot}
                  className="cap-btn-cta-large"
                  style={{
                    marginTop: "1.5rem",
                    opacity: guardando || !selectedGrupoId || !selectedSlot ? 0.6 : 1,
                    cursor: guardando || !selectedGrupoId || !selectedSlot ? "not-allowed" : "pointer"
                  }}
                >
                  {guardando ? (
                    "Guardando reserva..."
                  ) : (
                    <>
                      <span>🔒</span> CONFIRMAR Y GUARDAR RESERVA VIRTUAL
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ===================================================================
            TAB 3: ADMINISTRACIÓN SENCILLA
           =================================================================== */}
        {activeTab === "admin" && (
          <div className="cap-tab-content">
            <div className="cap-section-header">
              <h2 className="cap-section-title">
                <span>⚙️</span> Control y Administración de Capacitaciones
              </h2>
              <p className="cap-section-desc">
                Gestiona las sesiones de los 6 grupos, edita horarios, cancela reservas o añade el
                enlace de Microsoft Teams.
              </p>
            </div>

            {/* Métricas Resumen */}
            <div className="cap-admin-stats-grid">
              <div className="cap-stat-card">
                <div className="cap-stat-icon">🎓</div>
                <div>
                  <div className="cap-stat-val">
                    {totalProgramadas} / {TOTAL_SESIONES}
                  </div>
                  <div className="cap-stat-lbl">Sesiones Agendadas</div>
                </div>
              </div>

              <div className="cap-stat-card">
                <div className="cap-stat-icon">👥</div>
                <div>
                  <div className="cap-stat-val">{TOTAL_COLABORADORES}</div>
                  <div className="cap-stat-lbl">Total Colaboradores</div>
                </div>
              </div>

              <div className="cap-stat-card">
                <div className="cap-stat-icon">⏳</div>
                <div>
                  <div className="cap-stat-val">{totalPendientes}</div>
                  <div className="cap-stat-lbl">Grupos Pendientes</div>
                </div>
              </div>

              <div className="cap-stat-card">
                <div className="cap-stat-icon">💰</div>
                <div>
                  <div className="cap-stat-val">$400.000</div>
                  <div className="cap-stat-lbl">COP Modalidad Virtual</div>
                </div>
              </div>
            </div>

            {/* Listado de los 6 Grupos y su Estado */}
            <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "0.85rem" }}>
              Estado por Grupos de Trabajo
            </h3>

            <div className="cap-admin-groups-list">
              {GRUPOS_CAPACITACION.map((grupo) => {
                const reserva = reservasPorGrupo[grupo.id];

                return (
                  <div
                    key={grupo.id}
                    className={`cap-admin-group-card ${reserva ? "scheduled" : "pending"}`}
                  >
                    <div className="cap-admin-card-head">
                      <div>
                        <h4 className="cap-admin-group-title">
                          {grupo.icono} Grupo {grupo.id}: {grupo.nombre}
                        </h4>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-sub)" }}>
                          {grupo.participantes} participantes convocados
                        </span>
                      </div>

                      {reserva ? (
                        <span
                          className={`cap-status-pill ${
                            reserva.estado === "completada" ? "cap-pill-blue" : "cap-pill-green"
                          }`}
                        >
                          {reserva.estado === "completada" ? "✓ Completada" : "● Programada"}
                        </span>
                      ) : (
                        <span className="cap-status-pill cap-pill-yellow">
                          ⚠️ Pendiente por Agendar
                        </span>
                      )}
                    </div>

                    {reserva ? (
                      <div>
                        <div className="cap-admin-details">
                          <p>
                            <span>📅</span> <strong>Fecha y Hora:</strong> {reserva.fecha} —{" "}
                            {reserva.hora_slot}
                          </p>
                          <p>
                            <span>👤</span> <strong>Responsable:</strong> {reserva.responsable_nombre} (
                            {reserva.responsable_email})
                          </p>
                          <p>
                            <span>🏷️</span> <strong>Código Reserva:</strong> {reserva.codigo_reserva}
                          </p>
                        </div>

                        {/* Campo de enlace Microsoft Teams */}
                        <div className="cap-teams-box">
                          <span style={{ fontSize: "0.85rem", fontWeight: "600" }}>🔗 Teams:</span>
                          <input
                            type="url"
                            className="cap-teams-input"
                            placeholder="https://teams.microsoft.com/l/meetup-join/..."
                            value={
                              teamsInputs[reserva.id] !== undefined
                                ? teamsInputs[reserva.id]
                                : reserva.teams_link || ""
                            }
                            onChange={(e) =>
                              setTeamsInputs({ ...teamsInputs, [reserva.id]: e.target.value })
                            }
                          />
                          <button
                            type="button"
                            className="cap-btn-teams-save"
                            onClick={() => handleGuardarTeamsLink(reserva.id)}
                          >
                            Guardar Link
                          </button>

                          {reserva.teams_link && (
                            <a
                              href={reserva.teams_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="cap-btn-teams-link"
                            >
                              <span>↗</span> Abrir Teams
                            </a>
                          )}
                        </div>

                        {/* Botones de Acción */}
                        <div className="cap-admin-actions">
                          <button
                            type="button"
                            className="cap-btn-action-small"
                            onClick={() => handleCopiarWhatsApp(reserva)}
                          >
                            <span>📲</span> Copiar WhatsApp
                          </button>

                          <button
                            type="button"
                            className="cap-btn-action-small"
                            onClick={() => {
                              setReprogramandoReserva(reserva);
                              setNuevaFechaReprog(reserva.fecha);
                              setNuevoSlotReprog(null);
                            }}
                          >
                            <span>✏️</span> Reprogramar
                          </button>

                          {reserva.estado !== "completada" ? (
                            <button
                              type="button"
                              className="cap-btn-action-small"
                              onClick={() => handleCambiarEstado(reserva.id, "completada")}
                            >
                              <span>✅</span> Marcar Completada
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="cap-btn-action-small"
                              onClick={() => handleCambiarEstado(reserva.id, "programada")}
                            >
                              <span>↩️</span> Reabrir Sesión
                            </button>
                          )}

                          <button
                            type="button"
                            className="cap-btn-action-small cap-btn-danger"
                            onClick={() => handleCancelarReserva(reserva.id, grupo.nombre)}
                          >
                            <span>🗑️</span> Cancelar Reserva
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: "0.5rem" }}>
                        <p style={{ fontSize: "0.85rem", color: "var(--text-sub)", margin: "0 0 8px 0" }}>
                          Este grupo aún no tiene horario asignado. Puedes reservarlo directamente:
                        </p>
                        <button
                          type="button"
                          className="cap-btn-action-small"
                          style={{ background: "#0b3b60", color: "#ffffff", borderColor: "#0b3b60" }}
                          onClick={() => {
                            setSelectedGrupoId(grupo.id);
                            setActiveTab("agendar");
                          }}
                        >
                          <span>📅</span> Agendar {grupo.nombre}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================================
            MODAL 1: CONFIRMACIÓN EXITOSA DE RESERVA
           =================================================================== */}
        {reservaExitosa && (
          <div className="cap-modal-overlay">
            <div className="cap-modal-content">
              <div className="cap-success-icon-wrap">✓</div>
              <h3 className="cap-modal-title">¡Capacitación Agendada con Éxito!</h3>
              <p className="cap-modal-desc">
                La sesión ha quedado confirmada y registrada en el sistema de Laboratorios Gusing.
              </p>

              <div className="cap-receipt-card">
                <div className="cap-receipt-code">
                  <span>{reservaExitosa.codigo_reserva}</span>
                  <span style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: "700" }}>
                    CONFIRMADO
                  </span>
                </div>

                <div className="cap-receipt-item">
                  <strong>Grupo:</strong>
                  <span>{reservaExitosa.grupo_nombre}</span>
                </div>

                <div className="cap-receipt-item">
                  <strong>Participantes:</strong>
                  <span>{reservaExitosa.participantes_count} colaboradores</span>
                </div>

                <div className="cap-receipt-item">
                  <strong>Fecha:</strong>
                  <span>{reservaExitosa.fecha}</span>
                </div>

                <div className="cap-receipt-item">
                  <strong>Horario:</strong>
                  <span>{reservaExitosa.hora_slot} (90 min)</span>
                </div>

                <div className="cap-receipt-item">
                  <strong>Modalidad:</strong>
                  <span>Virtual (Microsoft Teams)</span>
                </div>

                <div className="cap-receipt-item">
                  <strong>Responsable:</strong>
                  <span>{reservaExitosa.responsable_nombre}</span>
                </div>

                <div className="cap-receipt-item">
                  <strong>Correo:</strong>
                  <span>{reservaExitosa.responsable_email}</span>
                </div>
              </div>

              <div className="cap-modal-actions">
                <button
                  type="button"
                  className="cap-btn-whatsapp"
                  onClick={() => handleCopiarWhatsApp(reservaExitosa)}
                >
                  <span>📲</span> {copiadoWhatsapp ? "¡Copiado al portapapeles!" : "Copiar para WhatsApp"}
                </button>

                <button
                  type="button"
                  className="cap-btn-outline"
                  onClick={() => {
                    setReservaExitosa(null);
                    setActiveTab("admin");
                  }}
                >
                  Ver en Panel de Control
                </button>

                <button
                  type="button"
                  className="cap-btn-outline"
                  style={{ border: "none" }}
                  onClick={() => setReservaExitosa(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            MODAL 2: REPROGRAMACIÓN DE RESERVA
           =================================================================== */}
        {reprogramandoReserva && (
          <div className="cap-modal-overlay">
            <div className="cap-modal-content" style={{ maxWidth: "600px" }}>
              <h3 className="cap-modal-title">
                Reprogramar: {reprogramandoReserva.grupo_nombre}
              </h3>
              <p className="cap-modal-desc">
                Horario actual: {reprogramandoReserva.fecha} a las {reprogramandoReserva.hora_slot}.
                Selecciona la nueva fecha y franja horaria:
              </p>

              <div style={{ textAlign: "left", marginBottom: "1rem" }}>
                <label className="cap-input-label">1. Seleccionar Nueva Fecha</label>
                <div className="cap-dates-scroll">
                  {fechasHabilitadas.map((f) => (
                    <div
                      key={f.fecha}
                      className={`cap-date-card ${nuevaFechaReprog === f.fecha ? "selected" : ""}`}
                      onClick={() => {
                        setNuevaFechaReprog(f.fecha);
                        setNuevoSlotReprog(null);
                      }}
                    >
                      <div className="cap-date-day-name">{f.nombreDia.slice(0, 3)}</div>
                      <div className="cap-date-day-number">{f.diaNumero}</div>
                      <div className="cap-date-month">Nov</div>
                    </div>
                  ))}
                </div>

                <label className="cap-input-label" style={{ marginTop: "1rem" }}>
                  2. Seleccionar Nuevo Horario
                </label>
                <div className="cap-slots-grid">
                  {getHorariosValidosPorDia(nuevaFechaReprog).map((slot) => {
                    const keySlot = `${nuevaFechaReprog}|${slot.label}`;
                    const ocupadoPor = slotsOcupadosMap[keySlot];
                    const esElMismo = ocupadoPor?.id === reprogramandoReserva.id;
                    const isSelected = nuevoSlotReprog?.id === slot.id;

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={ocupadoPor && !esElMismo}
                        className={`cap-slot-btn ${isSelected ? "selected" : ""} ${
                          ocupadoPor && !esElMismo ? "occupied" : ""
                        }`}
                        onClick={() => setNuevoSlotReprog(slot)}
                      >
                        <div>
                          <div className="cap-slot-time">{slot.label}</div>
                          <div className="cap-slot-shift">Turno {slot.turno}</div>
                        </div>
                        {ocupadoPor && !esElMismo ? (
                          <span className="cap-slot-status cap-slot-taken">Ocupado</span>
                        ) : (
                          <span className="cap-slot-status cap-slot-free">
                            {esElMismo ? "Actual" : "Disponible"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="cap-modal-actions">
                <button
                  type="button"
                  className="cap-btn-cta-large"
                  disabled={!nuevoSlotReprog}
                  onClick={handleEjecutarReprogramacion}
                >
                  Guardar Reprogramación
                </button>

                <button
                  type="button"
                  className="cap-btn-outline"
                  onClick={() => setReprogramandoReserva(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: VERIFICACIÓN DE PIN PARA PANEL DE CONTROL */}
        {showPinModal && (
          <div className="cap-modal-overlay">
            <div className="cap-modal-content" style={{ maxWidth: "420px" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "#e0f2fe",
                  color: "#0284c7",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.8rem",
                  margin: "0 auto 12px auto"
                }}
              >
                🔒
              </div>
              <h3 className="cap-modal-title">Acceso de Coordinación</h3>
              <p className="cap-modal-desc">
                Ingresa el PIN de coordinación para administrar, reprogramar o cancelar sesiones.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    pinInput.trim() === ADMIN_PIN ||
                    pinInput.trim() === "2026" ||
                    pinInput.trim().toLowerCase() === "karen"
                  ) {
                    setIsAdminUnlocked(true);
                    sessionStorage.setItem("cap_admin_unlocked", "true");
                    setShowPinModal(false);
                    setActiveTab("admin");
                  } else {
                    setPinError("PIN incorrecto. Intenta nuevamente.");
                  }
                }}
              >
                <div className="cap-input-group" style={{ textAlign: "left" }}>
                  <label className="cap-input-label">PIN de Administrador / Coordinación</label>
                  <input
                    type="password"
                    className="cap-input-field"
                    placeholder="Ingresa el PIN (ej: gusing2026)"
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value);
                      setPinError("");
                    }}
                    autoFocus
                    required
                  />
                  {pinError && (
                    <p
                      style={{
                        color: "#ef4444",
                        fontSize: "0.82rem",
                        margin: "6px 0 0 0",
                        fontWeight: "600"
                      }}
                    >
                      ⚠️ {pinError}
                    </p>
                  )}
                </div>

                <div className="cap-modal-actions" style={{ marginTop: "1rem" }}>
                  <button type="submit" className="cap-btn-cta-large">
                    Desbloquear Panel
                  </button>
                  <button
                    type="button"
                    className="cap-btn-outline"
                    onClick={() => setShowPinModal(false)}
                  >
                    Volver
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
