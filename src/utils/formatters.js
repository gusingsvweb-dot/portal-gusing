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
