import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import Login from "./pages/Login";
import Gerencia from "./pages/Gerencia";
import Atencion from "./pages/AtencionCliente";
import Produccion from "./pages/Produccion";
import Acondicionamiento from "./pages/Acondicionamiento";
import PedidosEnCurso from "./pages/PedidosEnCurso.jsx";
import Clientes from "./pages/Clientes.jsx";
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
import ConsolidadoFormato from "./pages/ConsolidadoFormato.jsx";
import KpisCompras from "./pages/KpisCompras.jsx";
import KpisMantenimiento from "./pages/KpisMantenimiento.jsx";
import GerenciaMantenimiento from "./pages/GerenciaMantenimiento.jsx";
import AutorizarDespachos from "./pages/AutorizarDespachos";
import GarantiaCalidad from "./pages/GarantiaCalidad";
import BodegaMP from "./pages/BodegaMP";
import BodegaPT from "./pages/BodegaPT";
import GestionEquipos from "./pages/GestionEquipos.jsx";
import GestionHerramientas from "./pages/GestionHerramientas.jsx";
import GestionProveedoresMant from "./pages/GestionProveedoresMant.jsx";
import PlanMaestro from "./pages/PlanMaestro.jsx";
import GestionRepuestos from "./pages/GestionRepuestos.jsx";
import ImportarCronograma from "./pages/ImportarCronograma.jsx";
import ImportarEquiposExcel from "./pages/ImportarEquiposExcel.jsx";
import TecnicoMantenimiento from "./pages/TecnicoMantenimiento.jsx";
import ProyectosMantenimiento from "./pages/ProyectosMantenimiento.jsx";



export function getHomeRouteForRole(rol) {
  switch (rol) {
    case "gerencia": return "/gerencia";
    case "atencion": return "/atencion";
    case "produccion": return "/produccion";
    case "usuario": return "/usuario/mis-solicitudes";
    case "acondicionamiento": return "/acondicionamiento";
    case "bodega": return "/bodega";
    case "bodega_mp": return "/bodega-mp";
    case "bodega_pt": return "/bodega-pt";
    case "microbiologia": return "/microbiologia";
    case "controlcalidad": return "/controlcalidad";
    case "planeacion": return "/dashboard";
    case "mantenimiento": return "/mantenimiento";
    case "tecnicomantenimiento":
    case "analistamantenimiento": return "/tecnico-mantenimiento";
    case "compras": return "/compras";
    case "gestioncalidad": return "/gestioncalidad";
    case "direcciontecnica": return "/direccion-tecnica";
    case "garantiacalidad": return "/garantiacalidad";
    default: return "/usuario/mis-solicitudes";
  }
}

export default function AppRouter() {
  const { usuarioActual, cargando } = useAuth();
  console.log("🔍 Router Render | Usuario:", usuarioActual, "Rol:", usuarioActual?.rol);

  const authOrRedirect = (roles, component) => {
    if (!usuarioActual) return <Navigate to="/" replace />;
    if (roles && !roles.includes(usuarioActual.rol)) {
      return <Navigate to={getHomeRouteForRole(usuarioActual.rol)} replace />;
    }
    return component;
  };

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
        element={authOrRedirect(["compras", "gerencia"], <KpisCompras />)}
      />

      {/* LOGIN */}
      <Route path="/" element={<Login />} />

      {/* DIRECCIÓN TÉCNICA */}
      <Route
        path="/direccion-tecnica"
        element={authOrRedirect(["direcciontecnica"], <DireccionTecnica />)}
      />

      {/* GARANTÍA DE CALIDAD (Administrador) */}
      <Route
        path="/garantiacalidad"
        element={authOrRedirect(["garantiacalidad"], <GarantiaCalidad />)}
      />

      {/* GERENCIA */}
      <Route
        path="/gerencia"
        element={authOrRedirect(["gerencia"], <Gerencia />)}
      />

      {/* GERENCIA - aprob compras */}
      <Route
        path="/gerenciacompras"
        element={authOrRedirect(["gerencia"], <GerenciaCompras />)}
      />

      {/* GERENCIA - supervision mantenimiento */}
      <Route
        path="/gerenciamantenimiento"
        element={authOrRedirect(["gerencia"], <GerenciaMantenimiento />)}
      />

      {/* Compras */}
      <Route
        path="/compras"
        element={authOrRedirect(["compras"], <Compras />)}
      />

      {/* GestionCalidad */}
      <Route
        path="/GestionCalidad"
        element={authOrRedirect(["gestioncalidad"], <GestionCalidad />)}
      />

      {/* MIS SOLICITUDES */}
      <Route
        path="/usuario/mis-solicitudes"
        element={usuarioActual ? <MisSolicitudes /> : <Navigate to="/" replace />}
      />


      {/* USUARIO */}
      <Route
        path="/usuario/crear-solicitud"
        element={usuarioActual ? <CrearSolicitud /> : <Navigate to="/" replace />}
      />


      {/* ATENCIÓN AL CLIENTE */}
      <Route
        path="/atencion"
        element={authOrRedirect(["atencion", "bodega_pt"], <Atencion />)}
      />

      <Route
        path="/clientes"
        element={authOrRedirect(["atencion", "gerencia"], <Clientes />)}
      />

      <Route
        path="/autorizar-despachos"
        element={authOrRedirect(["atencion"], <AutorizarDespachos />)}
      />

      {/* PEDIDOS EN CURSO */}
      <Route
        path="/pedidos-curso"
        element={authOrRedirect(["atencion", "gerencia", "bodega", "bodega_mp", "bodega_pt", "microbiologia", "controlcalidad", "acondicionamiento"], <PedidosEnCurso />)}
      />

      {/* PRODUCCIÓN */}
      <Route
        path="/produccion"
        element={authOrRedirect(["produccion"], <Produccion />)}
      />

      {/* ACONDICIONAMIENTO */}
      <Route
        path="/acondicionamiento"
        element={authOrRedirect(["acondicionamiento"], <Acondicionamiento />)}
      />

      {/* 🆕 BODEGA */}
      <Route
        path="/bodega"
        element={authOrRedirect(["bodega"], <Bodega />)}
      />

      <Route
        path="/bodega-mp"
        element={authOrRedirect(["bodega_mp"], <BodegaMP />)}
      />

      <Route
        path="/bodega-pt"
        element={authOrRedirect(["bodega_pt"], <BodegaPT />)}
      />

      {/* 🆕 MICRO */}
      <Route
        path="/microbiologia"
        element={authOrRedirect(["microbiologia"], <Microbiologia />)}
      />

      {/* 🆕 ControlCalidad */}
      <Route
        path="/controlcalidad"
        element={authOrRedirect(["controlcalidad"], <ControlCalidad />)}
      />

      {/* 🆕 PedidosFinalizados */}
      <Route
        path="/pedidos-finalizados"
        element={authOrRedirect(["produccion", "atencion", "gerencia"], <PedidosFinalizados />)}
      />

      {/* DASHBOARD */}
      <Route
        path="/dashboard"
        element={authOrRedirect(["produccion", "gerencia", "atencion", "planeacion"], <Dashboard />)}
      />

      {/* MANTENIMIENTO */}
      <Route
        path="/mantenimiento"
        element={authOrRedirect(["mantenimiento"], <Mantenimiento />)}
      />

      {/* MANTENIMIENTO TÉCNICO */}
      <Route
        path="/tecnico-mantenimiento"
        element={authOrRedirect(["tecnicomantenimiento", "analistamantenimiento", "gerencia"], <TecnicoMantenimiento />)}
      />

      <Route
        path="/mantenimiento/equipos"
        element={authOrRedirect(["mantenimiento", "analistamantenimiento", "tecnicomantenimiento", "gerencia"], <GestionEquipos />)}
      />

      <Route
        path="/mantenimiento/herramientas"
        element={<Navigate to="/mantenimiento/equipos" replace />}
      />

      <Route
        path="/mantenimiento/proveedores"
        element={authOrRedirect(["mantenimiento", "gerencia"], <GestionProveedoresMant />)}
      />

      <Route
        path="/mantenimiento/proyectos"
        element={authOrRedirect(["mantenimiento", "gerencia"], <ProyectosMantenimiento />)}
      />

      <Route
        path="/mantenimiento/plan-maestro"
        element={authOrRedirect(["mantenimiento", "analistamantenimiento", "tecnicomantenimiento", "gerencia"], <PlanMaestro />)}
      />

      <Route
        path="/mantenimiento/repuestos"
        element={authOrRedirect(["mantenimiento", "analistamantenimiento", "tecnicomantenimiento", "gerencia"], <GestionRepuestos />)}
      />

      <Route
        path="/mantenimiento/importar-cronograma"
        element={authOrRedirect(["mantenimiento", "gerencia"], <ImportarCronograma />)}
      />

      <Route
        path="/mantenimiento/importar-equipos"
        element={authOrRedirect(["mantenimiento", "gerencia"], <ImportarEquiposExcel />)}
      />

      {/* KPIs MANTENIMIENTO */}
      <Route
        path="/kpis-mantenimiento"
        element={authOrRedirect(["mantenimiento", "gerencia"], <KpisMantenimiento />)}
      />

      {/* CALENDARIO PRODUCCIÓN (COMPARTIDO) */}
      <Route
        path="/calendario"
        element={authOrRedirect(["produccion", "gerencia", "microbiologia", "controlcalidad", "planeacion", "atencion"], <CalendarioProduccion />)}
      />


      <Route
        path="/consolidado"
        element={authOrRedirect(["produccion", "gerencia", "atencion", "direcciontecnica", "planeacion"], <ConsolidadoPedidos />)}
      />

      <Route
        path="/consolidado-formato"
        element={authOrRedirect(["produccion", "gerencia", "atencion", "direcciontecnica", "planeacion"], <ConsolidadoFormato />)}
      />

    </Routes>
  );
}
