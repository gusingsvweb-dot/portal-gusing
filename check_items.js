import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('compras_solicitud_items').select('*').order('id', { ascending: false }).limit(5);
  console.log(data);
}
run();
