import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('NO_solicitudes').select('id, estado_id').eq('id', 360).limit(1);
  console.log(data, error);
}
run();
