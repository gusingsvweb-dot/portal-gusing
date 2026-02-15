import { Link, useNavigate } from "react-router-dom";
import "./Navbar.css";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { useMemo, useState } from "react";

export default function Navbar() {
  const { usuarioActual, logout } = useAuth();
  const navigate = useNavigate();

  const rol = usuarioActual?.rol || "general";
  const userIdInterno = usuarioActual?.id || null;

  // Extraer lógica de notificaciones del Context
  // (Solo si existe usuario, aunque el hook lo maneja internamente)
  const {
    notifs,
    noLeidas,
    marcarTodasLeidas,
    marcarLeida,
    activarNotifsEscritorio
  } = useNotifications();

  const [open, setOpen] = useState(false);

  function cerrarSesion() {
    logout();
    navigate("/");
  }

  function toggleCampana() {
    setOpen((v) => !v);
    activarNotifsEscritorio();
  }

  // ============================
  // MENÚ LIMPIO POR CADA ROL
  // ============================
  const MENUS = useMemo(
    () => ({
      atencion: {
        title: "Portal Interno – Atención al Cliente",
        items: [
          { to: "/atencion", label: "Registrar Pedido" },
          { to: "/pedidos-curso", label: "Pedidos en Curso" },
          { to: "/autorizar-despachos", label: "Autorizar Despachos" },
          { to: "/calendario", label: "Calendario" },
          { to: "/pedidos-finalizados", label: "Pedidos Finalizados" },
          { to: "/consolidado", label: "Consolidado" },
          { to: "/dashboard", label: "Dashboard" },
        ],
      },

      produccion: {
        title: "Portal Interno – Producción",
        items: [
          { to: "/produccion", label: "Pedidos Asignados" },
          { to: "/calendario", label: "Calendario" },
          { to: "/pedidos-finalizados", label: "Finalizados" },
          { to: "/consolidado", label: "Consolidado" },
          { to: "/dashboard", label: "Dashboard" },
        ],
      },

      gerencia: {
        title: "Portal Interno – Gerencia",
        items: [
          { to: "/gerencia", label: "Pedidos en Curso" },
          { to: "/calendario", label: "Calendario" },
          { to: "/pedidos-finalizados", label: "Finalizados" },
          { to: "/gerenciacompras", label: "Compras" },
          { to: "/gerenciamantenimiento", label: "Mantenimiento" },
          { to: "/consolidado", label: "Consolidado" },
          { to: "/dashboard", label: "Dashboard" },
        ],
      },

      compras: {
        title: "Portal Interno – Compras",
        items: [
          { to: "/compras", label: "Gestión Compras" },
          { to: "/kpis-compras", label: "KPIs" },
        ],
      },

      bodega: {
        title: "Portal Interno – Bodega",
        items: [{ to: "/bodega", label: "Pedidos Pendientes" }],
      },

      microbiologia: {
        title: "Portal Interno – Microbiología",
        items: [
          { to: "/microbiologia", label: "Análisis Pendientes" },
          { to: "/calendario", label: "Calendario" },
        ],
      },

      mantenimiento: {
        title: "Portal Interno – Mantenimiento",
        items: [
          { to: "/mantenimiento", label: "Mantenimiento" },
          { to: "/kpis-mantenimiento", label: "KPIs" },
        ],
      },

      acondicionamiento: {
        title: "Portal Interno – Acondicionamiento",
        items: [{ to: "/Acondicionamiento", label: "Pedidos Asignados" }],
      },

      controlcalidad: {
        title: "Portal Interno – Control de Calidad",
        items: [
          { to: "/ControlCalidad", label: "Pendientes" },
          { to: "/calendario", label: "Calendario" },
        ],
      },

      direcciontecnica: {
        title: "Portal Interno – Dirección Técnica",
        items: [
          { to: "/direccion-tecnica", label: "Gestión de Productos" },
          { to: "/consolidado", label: "Consolidado" }
        ],
      },

      usuario: {
        title: "Portal Interno – Usuario",
        items: [
          { to: "/usuario/mis-solicitudes", label: "Mis Solicitudes" },
          { to: "/usuario/crear-solicitud", label: "Hacer Solicitud" },
        ],
      },

      planeacion: {
        title: "Portal Interno – Planeación",
        items: [
          { to: "/calendario", label: "Calendario" },
          { to: "/consolidado", label: "Consolidado" },
          { to: "/dashboard", label: "Dashboard" },
        ],
      },

      general: { title: "Portal Interno", items: [] },
    }),
    []
  );

  const menu = MENUS[rol] || MENUS.general;

  return (
    <nav className="nav-wrapper">
      <div className="nav-left">
        <img
          src="https://gqspcolombia.org/wp-content/uploads/2025/09/21.png"
          alt="Logo"
          className="nav-logo"
        />
        <span className="nav-title">{menu.title}</span>
      </div>

      <div className="nav-links">
        {menu.items.map((item) => (
          <Link key={item.to} to={item.to}>
            {item.label}
          </Link>
        ))}
      </div>

      {/* Campana */}
      {userIdInterno && (
        <div className="nav-notifs-container">
          <button
            onClick={toggleCampana}
            className="nav-notif-btn"
            title="Notificaciones"
          >
            🔔
            {noLeidas > 0 && (
              <span className="nav-badge">
                {noLeidas}
              </span>
            )}
          </button>

          {open && (
            <div className="notif-dropdown">
              <div className="notif-header">
                <strong>Notificaciones</strong>
                <button
                  onClick={marcarTodasLeidas}
                  className="notif-read-btn"
                >
                  Marcar leídas
                </button>

              </div>

              <div className="notif-list">
                {notifs.length === 0 ? (
                  <div className="notif-empty">
                    Sin notificaciones.
                  </div>
                ) : (
                  notifs.map((n) => (
                    <div
                      key={n.id}
                      className={`notif-item ${n.leida ? 'read' : 'unread'}`}
                    >
                      <div className="notif-content-wrapper">
                        <div className="notif-item-title">
                          {n.titulo}
                        </div>
                        <div className="notif-item-msg">
                          {n.mensaje}
                        </div>
                        <div className="notif-item-date">
                          {new Date(n.created_at).toLocaleString("es-CO")}
                          {n.pedido_id ? ` · Pedido #${n.pedido_id}` : ""}
                        </div>
                      </div>
                      {!n.leida && (
                        <button
                          className="notif-mark-read-btn"
                          onClick={(e) => { e.stopPropagation(); marcarLeida(n.id); }}
                          title="Marcar como leída"
                        >
                          ✔
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <button className="nav-logout" onClick={cerrarSesion}>
        Cerrar sesión
      </button>
    </nav>
  );
}
