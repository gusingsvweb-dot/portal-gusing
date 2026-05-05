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
    'notificaciones', 'tareas_produccion', 'pedido_etapas_liberaciones',
    'activos', 'proveedores_mant'
  ];

  let result = selectString;
  relationships.forEach(rel => {
    // Busca el nombre de la relación, ya sea solo o con un alias previo (ej: destino:areas)
    // El regex busca el nombre de la tabla precedido por : o por un espacio/inicio de string,
    // y seguido de ( o !
    const regex = new RegExp("(\\b" + rel + ")\\b(?=\\s*[\\(!])", "g");
    
    // Si ya tiene un alias (ej: area_destino:areas), reemplazamos solo la tabla
    // Si no lo tiene, creamos el alias para que el frontend reciba el nombre original
    result = result.replace(regex, (match, p1, offset) => {
      const charBefore = result[offset - 1];
      if (charBefore === ':') {
        // Caso 'alias:tabla' -> 'alias:NO_tabla'
        return `NO_${p1}`;
      } else {
        // Caso 'tabla' -> 'tabla:NO_tabla'
        return `${p1}:NO_${p1}`;
      }
    });
  });

  return result;
};
