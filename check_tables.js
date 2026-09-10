import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('NO_compras_solicitudes_detalle').select('*').limit(1);
  console.log("Error:", error?.message);
}
run();
