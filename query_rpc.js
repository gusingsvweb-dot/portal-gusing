import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.rpc('rpc_compras_generar_numero_oc', { p_creador_id: 'some_id', p_solicitud_id: 123 });
  console.log("Error:", error);
}
run();
