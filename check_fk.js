import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('NO_solicitudes').select('*, tipos_solicitud:NO_tipos_solicitud ( nombre )').limit(1);
  console.log("Error tipos_solicitud:", error?.message);
}
run();
