import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('compras_solicitudes_detalle').select('*').eq('solicitud_id', 1).limit(1);
  console.log("Detalle:", data, "Error:", error);
}
run();
