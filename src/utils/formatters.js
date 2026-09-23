export function getTicketCode(ticket) {
  if (!ticket) return "";
  const num = ticket.consecutivo || ticket.id;
  
  // Mantenimiento (area_id = 1)
  if (Number(ticket.area_id) === 1) {
    const tipo = Number(ticket.tipo_solicitud_id);
    if (tipo === 2 || tipo === 8) return `MC-${num}`;
    if (tipo === 6 || tipo === 9) return `MM-${num}`;
    if (tipo === 5) return `MP-${num}`;
    return `M-${num}`;
  }

  // Compras (area_id = 4)
  if (ticket.area_id === 4) return `C-${num}`;

  // Default para otras áreas
  if (ticket.area_id) {
     return `#${num}`; // Fallback genérico
  }
  
  // Por si el ticket no tiene area_id pero sabemos que es de mantenimiento (fallback viejo)
  const tipo = Number(ticket.tipo_solicitud_id);
  if (tipo === 2 || tipo === 8) return `MC-${num}`;
  if (tipo === 6 || tipo === 9) return `MM-${num}`;
  if (tipo === 5) return `MP-${num}`;
  return `M-${num}`;
}

export function getTicketCategory(solicitud) {
  if (!solicitud) return "equipos";
  const desc = (solicitud.descripcion || "").toLowerCase();
  const actNombre = (solicitud.activos?.nombre || "").toLowerCase();
  const actTipo = (solicitud.activos?.tipo || solicitud.activos?.categoria || "").toLowerCase();

  if (desc.includes("[instalaci") || actTipo.includes("instalaci")) {
    return "instalaciones";
  }
  if (
    desc.includes("[comput") || 
    desc.includes("computador") || 
    desc.includes("laptop") || 
    desc.includes("impresora") || 
    actTipo.includes("comput") || 
    actTipo.includes("ti") || 
    actNombre.includes("comput") || 
    actNombre.includes("laptop") || 
    actNombre.includes("impresora")
  ) {
    return "computo";
  }
  return "equipos";
}

export function parseTicketDetails(solicitud) {
  if (!solicitud) return { solicitante: "—", area: "—", descripcionLimpia: "" };

  const rawDesc = solicitud.descripcion || "";
  let solicitante = "";
  let cleanDesc = rawDesc;

  // 1. Extraer nombre del solicitante si viene como "Solicitante: Nombre"
  const solMatch = cleanDesc.match(/Solicitante:\s*([^\n\[]+)/i);
  if (solMatch && solMatch[1]) {
    solicitante = solMatch[1].trim();
    cleanDesc = cleanDesc.replace(/Solicitante:\s*[^\n\[]+/i, "");
  }

  // 2. Quitar etiquetas entre corchetes ej: [EQUIPO - CORRECTIVO], [COMPUTADOR - CORRECTIVO], [INSTALACIÓN: ...], etc.
  cleanDesc = cleanDesc.replace(/\[[^\]]+\]/g, "").trim();

  // Limpiar saltos de línea y espacios sobrantes
  cleanDesc = cleanDesc.replace(/^\s*[\r\n]+/, "").replace(/[\r\n]{3,}/g, "\n\n").trim();

  // 3. Fallback para Solicitante
  if (!solicitante) {
    solicitante = solicitud.nombre_solicitante || solicitud.solicitante || solicitud.usuario_id || "—";
  }

  // 4. Area Solicitante
  let area = solicitud.area_solicitante;
  if (!area || area === "—" || area.trim() === "") {
    if (solicitud.usuario_id && !solicitud.usuario_id.includes(".")) {
      area = solicitud.usuario_id.charAt(0).toUpperCase() + solicitud.usuario_id.slice(1);
    } else {
      area = "—";
    }
  }

  return {
    solicitante,
    area,
    descripcionLimpia: cleanDesc || rawDesc
  };
}
