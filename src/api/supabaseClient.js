import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Helper para obtener el nombre de la tabla dinámicamente según la versión (Oficial / NO_)
 * Se lee de localStorage para ser accesible fuera de componentes de React.
 */
export const st = (tableName) => {
  const isNoOficial = localStorage.getItem("isNoOficial") === "true";
  if (!isNoOficial) return tableName;
  if (tableName.startsWith("NO_")) return tableName;
  return `NO_${tableName}`;
};
