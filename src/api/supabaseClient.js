import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Helper para obtener el nombre de la tabla dinámicamente según la versión (Oficial / NO_)
 * Se lee de localStorage para ser accesible fuera de componentes de React.
 */
export const st = (tableName) => {
  const saved = localStorage.getItem("isNoOficial");
  if (saved === null) return tableName;
  const isNoOficial = saved === "true";
  
  if (!isNoOficial) return tableName;
  if (tableName.startsWith("NO_")) return tableName;
  return `NO_${tableName}`;
};

/**
 * Helper para transformar el string de .select() y aplicar aliasing a las relaciones
 * para que el frontend siga recibiendo los mismos nombres de campo (ej: productos)
 * pero consulte las tablas NO_ correspondientes.
 */
export const ss = (selectString) => {
  const saved = localStorage.getItem("isNoOficial");
  if (saved !== "true") return selectString;

  // Lista de relaciones comunes que deben ser aliased
  const relationships = [
    'productos', 'clientes', 'estados', 'usuarios', 'areas',
    'prioridades', 'tipos_solicitud', 'pedido_etapas', 'pedidos_produccion',
    'observaciones_pedido', 'MateriasPrimas', 'flujos_forma', 'pedidos_bodega_items',
    'notificaciones', 'tareas_produccion'
  ];

  let result = selectString;
  relationships.forEach(rel => {
    // Se usa un límite de palabra (\b) para encontrar el nombre de la relación.
    // Esto es robusto ante espacios/saltos de línea y evita renombrar si ya tiene prefijo (ej: NO_).
    const regex = new RegExp("\\b(" + rel + ")\\s*\\(", "g");
    result = result.replace(regex, "$1:NO_$1(");
  });

  return result;
};
