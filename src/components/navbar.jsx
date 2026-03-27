import { NavLink, useNavigate } from "react-router-dom";
import "./Navbar.css";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { useTheme } from "../context/ThemeContext";
import { useMemo, useState, useEffect, useRef } from "react";

export default function Navbar() {
  const { usuarioActual, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const rol = usuarioActual?.rol || "general";
  const userIdInterno = usuarioActual?.id || null;

  const {
    notifs,
    noLeidas,
    marcarTodasLeidas,
    marcarLeida,
    activarNotifsEscritorio
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  function cerrarSesion() {
    logout();
    navigate("/");
  }

  function toggleCampana() {
    setOpen((v) => !v);
    activarNotifsEscritorio();
  }

  const MENUS = useMemo(
    () => ({
      atencion: {
        title: "Atención al Cliente",
        items: [
          { to: "/atencion", label: "Registro", icon: "📝" },
          { to: "/pedidos-curso", label: "En Curso", icon: "⚡" },
          { to: "/clientes", label: "Clientes", icon: "👥" },
          { to: "/autorizar-despachos", label: "Autorizar", icon: "✅" },
          { to: "/calendario", label: "Agenda", icon: "📅" },
          { to: "/pedidos-finalizados", label: "Cerrados", icon: "📂" },
          { to: "/consolidado", label: "Consolidado", icon: "📊" },
          { to: "/dashboard", label: "Métricas", icon: "📈" },
        ],
      },

      produccion: {
        title: "Producción",
        items: [
          { to: "/produccion", label: "Asignados", icon: "⚙️" },
          { to: "/produccion?lote=true", label: "Desp. en Lote", icon: "🧫" },
          { to: "/calendario", label: "Agenda", icon: "📅" },
          { to: "/pedidos-finalizados", label: "Cerrados", icon: "📂" },
          { to: "/consolidado", label: "Consolidado", icon: "📊" },
          { to: "/dashboard", label: "Métricas", icon: "📈" },
        ],
      },

      gerencia: {
        title: "Gerencia",
        items: [
          { to: "/gerencia", label: "Operaciones", icon: "🏢" },
          { to: "/calendario", label: "Agenda", icon: "📅" },
          { to: "/pedidos-finalizados", label: "Cerrados", icon: "📂" },
          { to: "/gerenciacompras", label: "Compras", icon: "🛒" },
          { to: "/gerenciamantenimiento", label: "Mantenimiento", icon: "🛠️" },
          { to: "/consolidado", label: "Consolidado", icon: "📊" },
          { to: "/dashboard", label: "Métricas", icon: "📈" },
        ],
      },

      compras: {
        title: "Compras",
        items: [
          { to: "/compras", label: "Gestión", icon: "🛒" },
          { to: "/kpis-compras", label: "KPIs", icon: "📈" },
        ],
      },

      bodega: {
        title: "Bodega General",
        items: [
          { to: "/bodega", label: "Pendientes", icon: "📦" },
          { to: "/pedidos-curso", label: "En Curso", icon: "⚡" },
        ],
      },

      bodega_mp: {
        title: "Bodega MP",
        items: [
          { to: "/bodega-mp", label: "Insumos", icon: "🧪" },
          { to: "/pedidos-curso", label: "En Curso", icon: "⚡" },
        ],
      },

      bodega_pt: {
        title: "Bodega PT",
        items: [
          { to: "/bodega-pt", label: "Despachos", icon: "🚚" },
          { to: "/pedidos-curso", label: "En Curso", icon: "⚡" },
        ],
      },

      microbiologia: {
        title: "Laboratorio Micro",
        items: [
          { to: "/microbiologia", label: "Análisis", icon: "🔬" },
          { to: "/pedidos-curso", label: "En Curso", icon: "⚡" },
          { to: "/calendario", label: "Agenda", icon: "📅" },
        ],
      },

      mantenimiento: {
        title: "Mantenimiento",
        items: [
          { to: "/mantenimiento", label: "Órdenes", icon: "🛠️" },
          { to: "/kpis-mantenimiento", label: "KPIs", icon: "📈" },
        ],
      },

      acondicionamiento: {
        title: "Acondicionamiento",
        items: [
          { to: "/Acondicionamiento", label: "Procesos", icon: "📦" },
          { to: "/pedidos-curso", label: "En Curso", icon: "⚡" },
        ],
      },

      controlcalidad: {
        title: "Control Calidad",
        items: [
          { to: "/ControlCalidad", label: "Inspección", icon: "🔍" },
          { to: "/pedidos-curso", label: "En Curso", icon: "⚡" },
          { to: "/calendario", label: "Agenda", icon: "📅" },
        ],
      },

      direcciontecnica: {
        title: "Dirección Técnica",
        items: [
          { to: "/direccion-tecnica", label: "Productos", icon: "📝" },
          { to: "/consolidado", label: "Consolidado", icon: "📊" }
        ],
      },

      garantiacalidad: {
        title: "Garantía Calidad",
        items: [
          { to: "/garantiacalidad", label: "Admin", icon: "🛡️" },
          { to: "/consolidado", label: "Consolidado", icon: "📊" }
        ],
      },

      usuario: {
        title: "Portal Usuario",
        items: [
          { to: "/usuario/mis-solicitudes", label: "Mis Pedidos", icon: "📋" },
          { to: "/usuario/crear-solicitud", label: "Nuevo", icon: "➕" },
        ],
      },

      planeacion: {
        title: "Planeación",
        items: [
          { to: "/calendario", label: "Agenda", icon: "📅" },
          { to: "/consolidado", label: "Consolidado", icon: "📊" },
          { to: "/dashboard", label: "Métricas", icon: "📈" },
        ],
      },

      general: { title: "Portal Gusing", items: [] },
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
          <NavLink key={item.to} to={item.to} end={item.to === "/"}>
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </div>

      <div className="nav-right-actions">
        {userIdInterno && (
          <div className="nav-notifs-container" ref={notifRef}>
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
                    Marcar todas leídas
                  </button>
                </div>

                <div className="notif-list">
                  {notifs.length === 0 ? (
                    <div className="notif-empty" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-sub)' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🎐</div>
                      Sin notificaciones.
                    </div>
                  ) : (
                    notifs.map((n) => (
                      <div
                        key={n.id}
                        className={`notif-item ${n.leida ? 'read' : 'unread'}`}
                        onClick={() => !n.leida && marcarLeida(n.id)}
                      >
                        <div className="notif-content-wrapper">
                          <div className="notif-item-title">{n.titulo}</div>
                          <div className="notif-item-msg">{n.mensaje}</div>
                          <div className="notif-item-date">
                            🕒 {new Date(n.created_at).toLocaleString("es-CO")}
                            {n.pedido_id ? ` · 📦 #${n.pedido_id}` : ""}
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

        <button
          className="nav-theme-toggle"
          onClick={toggleTheme}
          title={`Activar modo ${theme === 'light' ? 'oscuro' : 'claro'}`}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>

        <button className="nav-logout" onClick={cerrarSesion}>
          🚪 Salir
        </button>
      </div>
    </nav>
  );
}
