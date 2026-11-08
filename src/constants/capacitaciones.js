// Definición de grupos, disponibilidad y reglas de agendamiento de capacitaciones
export const GRUPOS_CAPACITACION = [
  {
    id: 1,
    nombre: "Mantenimiento, Validaciones y Metrología",
    participantes: 5,
    areas: ["Mantenimiento", "Validaciones", "Metrología"],
    icono: "🛠️",
    descripcion: "Personal técnico y analistas de mantenimiento, validaciones y metrología."
  },
  {
    id: 2,
    nombre: "Control, Garantía y Aseguramiento de Calidad",
    participantes: 5,
    areas: ["Control Calidad", "Garantía Calidad", "Aseguramiento de Calidad"],
    icono: "🔬",
    descripcion: "Analistas y coordinadores de calidad físico-química, garantía y aseguramiento."
  },
  {
    id: 3,
    nombre: "Microbiología, Archivo, Regulatorios y Ambiental",
    participantes: 5,
    areas: ["Microbiología", "Archivo", "Asuntos Regulatorios", "Gestión Ambiental"],
    icono: "🧫",
    descripcion: "Equipo de laboratorio de microbiología, archivo documental y gestión regulatoria/ambiental."
  },
  {
    id: 4,
    nombre: "Producción, Planeación y Bodega PT",
    participantes: 5,
    areas: ["Producción", "Planeación", "Bodega PT"],
    icono: "⚙️",
    descripcion: "Líderes de operaciones en planta, planeación de la producción y producto terminado."
  },
  {
    id: 5,
    nombre: "Logística, Bodega MP, Compras, Comercial y Atención al Cliente",
    participantes: 5,
    areas: ["Logística", "Bodega MP", "Compras", "Comercial", "Atención al Cliente"],
    icono: "📦",
    descripcion: "Cadena de suministros, aprovisionamiento de materia prima, ventas y servicio al cliente."
  },
  {
    id: 6,
    nombre: "Gerencia, Asistencia, Talento Humano y SST",
    participantes: 4,
    areas: ["Gerencia", "Asistencia", "Talento Humano", "SST"],
    icono: "🏢",
    descripcion: "Dirección ejecutiva, asistencia gerencial, gestión de talento y seguridad laboral."
  }
];

export const TOTAL_COLABORADORES = 29;
export const TOTAL_SESIONES = 6;
export const DURACION_MINUTOS = 90;

export const BENEFICIOS_VIRTUAL = [
  {
    icono: "🏢",
    titulo: "Desde el puesto de trabajo",
    descripcion: "Sin necesidad de abandonar las instalaciones ni interrumpir la jornada operativa."
  },
  {
    icono: "🚗",
    titulo: "Cero desplazamientos",
    descripcion: "Ahorro de costos y tiempos de traslado para la empresa y los colaboradores."
  },
  {
    icono: "⏰",
    titulo: "Horarios flexibles",
    descripcion: "Franjas organizadas en mañana y tarde para no afectar las entregas críticas."
  },
  {
    icono: "🎥",
    titulo: "Grabaciones disponibles",
    descripcion: "Videos disponibles para consulta posterior, refuerzo y nuevas inducciones."
  },
  {
    icono: "📖",
    titulo: "Manuales y guías PDF",
    descripcion: "Material descargable estructurado paso a paso para consulta inmediata."
  },
  {
    icono: "💬",
    titulo: "Sesiones en vivo con dudas",
    descripcion: "Interacción directa con el facilitador para resolver casos prácticos del día a día."
  },
  {
    icono: "👥",
    titulo: "Capacitación por áreas",
    descripcion: "Grupos reducidos y enfocados en las herramientas que cada departamento utiliza."
  },
  {
    icono: "⚡",
    titulo: "Finalización ágil",
    descripcion: "Programa completo completable en 2 a 3 días con mínima fricción."
  }
];

export const TARIFAS = {
  virtual: {
    modalidad: "Virtual",
    precio: 400000,
    precioFormateado: "$400.000 COP",
    destacada: true,
    caracteristicas: [
      "Seis (6) capacitaciones virtuales de hasta 90 minutos",
      "Manuales y documentación completa en formato PDF",
      "A elección: las 6 grabaciones o un video general editado",
      "Sesiones en vivo para resolución de dudas e inquietudes",
      "Conexión directa mediante Microsoft Teams"
    ]
  },
  presencial: {
    modalidad: "Presencial",
    precio: 750000,
    precioFormateado: "$750.000 COP",
    destacada: false,
    caracteristicas: [
      "Seis (6) sesiones presenciales en las instalaciones",
      "Documentación completa en formato PDF",
      "Sin grabaciones de video disponibles",
      "Programación sujeta a disponibilidad y coordinación de salas"
    ]
  }
};

/**
 * Retorna los horarios válidos para un día específico según las reglas de negocio:
 * - Miércoles: 1:30 - 3:00 p.m. / 3:30 - 5:00 p.m.
 * - Jueves y Viernes: 8:00 - 9:30 a.m. / 10:00 - 11:30 a.m. / 1:30 - 3:00 p.m. / 3:30 - 5:00 p.m.
 */
export function getHorariosValidosPorDia(date) {
  // date puede ser string YYYY-MM-DD o Date object
  const d = typeof date === "string" ? new Date(`${date}T12:00:00`) : new Date(date);
  const dayOfWeek = d.getDay(); // 0: Dom, 1: Lun, 2: Mar, 3: Mié, 4: Jue, 5: Vie, 6: Sáb

  // Miércoles (3): Solo tarde
  if (dayOfWeek === 3) {
    return [
      { id: "13:30-15:00", hora_inicio: "13:30:00", hora_fin: "15:00:00", label: "1:30 a 3:00 p. m.", turno: "Tarde" },
      { id: "15:30-17:00", hora_inicio: "15:30:00", hora_fin: "17:00:00", label: "3:30 a 5:00 p. m.", turno: "Tarde" }
    ];
  }

  // Jueves (4) o Viernes (5): Mañana y tarde
  if (dayOfWeek === 4 || dayOfWeek === 5) {
    return [
      { id: "08:00-09:30", hora_inicio: "08:00:00", hora_fin: "09:30:00", label: "8:00 a 9:30 a. m.", turno: "Mañana" },
      { id: "10:00-11:30", hora_inicio: "10:00:00", hora_fin: "11:30:00", label: "10:00 a 11:30 a. m.", turno: "Mañana" },
      { id: "13:30-15:00", hora_inicio: "13:30:00", hora_fin: "15:00:00", label: "1:30 a 3:00 p. m.", turno: "Tarde" },
      { id: "15:30-17:00", hora_inicio: "15:30:00", hora_fin: "17:00:00", label: "3:30 a 5:00 p. m.", turno: "Tarde" }
    ];
  }

  return [];
}

/**
 * Genera la lista de todas las fechas habilitadas en Noviembre de 2026 hasta el viernes 27
 */
export function getFechasHabilitadasNoviembre2026() {
  const fechas = [];
  // Noviembre 2026: del día 9 al 27
  // Los días permitidos son Miércoles (3), Jueves (4) y Viernes (5)
  for (let dia = 9; dia <= 27; dia++) {
    const diaStr = String(dia).padStart(2, "0");
    const dateStr = `2026-11-${diaStr}`;
    const d = new Date(`${dateStr}T12:00:00`);
    const dayOfWeek = d.getDay();

    if (dayOfWeek === 3 || dayOfWeek === 4 || dayOfWeek === 5) {
      const nombreDia = dayOfWeek === 3 ? "Miércoles" : dayOfWeek === 4 ? "Jueves" : "Viernes";
      fechas.push({
        fecha: dateStr,
        diaNumero: dia,
        nombreDia,
        etiquetaCorta: `${nombreDia} ${dia} Nov`,
        etiquetaLarga: `${nombreDia}, ${dia} de Noviembre de 2026`,
        dayOfWeek
      });
    }
  }
  return fechas;
}
