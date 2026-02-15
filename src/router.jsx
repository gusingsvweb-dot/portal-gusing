import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import Login from "./pages/Login";
import Gerencia from "./pages/Gerencia";
import Atencion from "./pages/AtencionCliente";
import Produccion from "./pages/Produccion";
import Acondicionamiento from "./pages/Acondicionamiento";
import PedidosEnCurso from "./pages/PedidosEnCurso.jsx";
import Bodega from "./pages/Bodega";
import Microbiologia from "./pages/Microbiologia.jsx";
import ControlCalidad from "./pages/ControlCalidad.jsx";
import PedidosFinalizados from "./pages/PedidosFinalizados.jsx";
import Dashboard from "./pages/Dashboard";
import CrearSolicitud from "./pages/CrearSolicitud";
import Mantenimiento from "./pages/Mantenimiento.jsx";
import MisSolicitudes from "./pages/MisSolicitudes.jsx";
import GerenciaCompras from "./pages/GerenciaCompras.jsx";
import GestionCalidad from "./pages/GestionCalidad.jsx";
import Compras from "./pages/Compras.jsx";
import DireccionTecnica from "./pages/DireccionTecnica.jsx";
import CalendarioProduccion from "./pages/CalendarioProduccion.jsx";
import ConsolidadoPedidos from "./pages/ConsolidadoPedidos.jsx";
import KpisCompras from "./pages/KpisCompras.jsx";
import KpisMantenimiento from "./pages/KpisMantenimiento.jsx";
import GerenciaMantenimiento from "./pages/GerenciaMantenimiento.jsx";
import AutorizarDespachos from "./pages/AutorizarDespachos";


export default function AppRouter() {
  const { usuarioActual, cargando } = useAuth();

  if (cargando) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Cargando sesión...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/kpis-compras"
        element={
          ["compras", "gerencia"].includes(usuarioActual?.rol)
            ? <KpisCompras />
            : <Navigate to="/" />
        }
      />

      {/* LOGIN */}
      <Route path="/" element={<Login />} />

      {/* DIRECCIÓN TÉCNICA */}
      <Route
        path="/direccion-tecnica"
        element={
          usuarioActual?.rol === "direcciontecnica"
            ? <DireccionTecnica />
            : <Navigate to="/" />
        }
      />

      {/* GERENCIA */}
      <Route
        path="/gerencia"
        element={
          usuarioActual?.rol === "gerencia"
            ? <Gerencia />
            : <Navigate to="/" />
        }
      />

      {/* GERENCIA - aprob compras */}
      <Route
        path="/gerenciacompras"
        element={
          usuarioActual?.rol === "gerencia"
            ? <GerenciaCompras />
            : <Navigate to="/" />
        }
      />

      {/* GERENCIA - supervision mantenimiento */}
      <Route
        path="/gerenciamantenimiento"
        element={
          usuarioActual?.rol === "gerencia"
            ? <GerenciaMantenimiento />
            : <Navigate to="/" />
        }
      />

      {/* Compras */}
      <Route
        path="/compras"
        element={
          usuarioActual?.rol === "compras"
            ? <Compras />
            : <Navigate to="/" />
        }
      />

      {/* GestionCalidad */}
      <Route
        path="/GestionCalidad"
        element={
          usuarioActual?.rol === "gestioncalidad"
            ? <GestionCalidad />
            : <Navigate to="/" />
        }
      />

      {/* MIS SOLICITUDES */}
      <Route
        path="/usuario/mis-solicitudes"
        element={
          usuarioActual?.rol === "usuario"
            ? <MisSolicitudes />
            : <Navigate to="/" />
        }
      />


      {/* USUARIO */}
      <Route
        path="/usuario/crear-solicitud"
        element={
          usuarioActual?.rol === "usuario"
            ? <CrearSolicitud />
            : <Navigate to="/" />
        }
      />


      {/* ATENCIÓN AL CLIENTE */}
      <Route
        path="/atencion"
        element={
          usuarioActual?.rol === "atencion"
            ? <Atencion />
            : <Navigate to="/" />
        }
      />

      <Route
        path="/autorizar-despachos"
        element={
          usuarioActual?.rol === "atencion"
            ? <AutorizarDespachos />
            : <Navigate to="/" />
        }
      />

      {/* PEDIDOS EN CURSO */}
      <Route
        path="/pedidos-curso"
        element={
          ["atencion", "gerencia"].includes(usuarioActual?.rol)
            ? <PedidosEnCurso />
            : <Navigate to="/" />
        }
      />

      {/* PRODUCCIÓN */}
      <Route
        path="/produccion"
        element={
          usuarioActual?.rol === "produccion"
            ? <Produccion />
            : <Navigate to="/" />
        }
      />

      {/* ACONDICIONAMIENTO */}
      <Route
        path="/acondicionamiento"
        element={
          usuarioActual?.rol === "acondicionamiento"
            ? <Acondicionamiento />
            : <Navigate to="/" />
        }
      />

      {/* 🆕 BODEGA */}
      <Route
        path="/bodega"
        element={
          usuarioActual?.rol === "bodega"
            ? <Bodega />
            : <Navigate to="/" />
        }
      />

      {/* 🆕 MICRO */}
      <Route
        path="/microbiologia"
        element={
          usuarioActual?.rol === "microbiologia"
            ? <Microbiologia />
            : <Navigate to="/" />
        }
      />

      {/* 🆕 ControlCalidad */}
      <Route
        path="/controlcalidad"
        element={
          usuarioActual?.rol === "controlcalidad"
            ? <ControlCalidad />
            : <Navigate to="/" />
        }
      />

      {/* 🆕 PedidosFinalizados */}
      <Route
        path="/pedidos-finalizados"
        element={
          ["produccion", "atencion", "gerencia"].includes(usuarioActual?.rol)
            ? <PedidosFinalizados />
            : <Navigate to="/" />
        }
      />

      {/* DASHBOARD */}
      <Route
        path="/dashboard"
        element={
          ["produccion", "gerencia", "atencion", "planeacion"].includes(usuarioActual?.rol)
            ? <Dashboard />
            : <Navigate to="/" />
        }
      />

      {/* MANTENIMIENTO */}
      <Route
        path="/mantenimiento"
        element={
          ["mantenimiento"].includes(usuarioActual?.rol)
            ? <Mantenimiento />
            : <Navigate to="/" />
        }
      />

      {/* KPIs MANTENIMIENTO */}
      <Route
        path="/kpis-mantenimiento"
        element={
          ["mantenimiento", "gerencia"].includes(usuarioActual?.rol)
            ? <KpisMantenimiento />
            : <Navigate to="/" />
        }
      />

      {/* CALENDARIO PRODUCCIÓN (COMPARTIDO) */}
      <Route
        path="/calendario"
        element={
          ["produccion", "gerencia", "microbiologia", "controlcalidad", "planeacion", "atencion"].includes(usuarioActual?.rol)
            ? <CalendarioProduccion />
            : <Navigate to="/" />
        }
      />


      <Route
        path="/consolidado"
        element={
          ["produccion", "gerencia", "atencion", "direcciontecnica", "planeacion"].includes(usuarioActual?.rol)
            ? <ConsolidadoPedidos />
            : <Navigate to="/" />
        }
      />

    </Routes>
  );
}
