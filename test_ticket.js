import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: sol, error } = await supabase.from('solicitudes').select('*, compras_solicitudes_detalle(*), compras_cotizaciones(*)').eq('consecutivo', 6);
  console.log("Sol:", JSON.stringify(sol, null, 2), "Error:", error);
}
run();
