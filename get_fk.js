import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.rpc('get_fks');
  if (error) {
     // fallback if rpc doesn't exist
     const q = await supabase.from('NO_solicitudes').select('*').limit(1);
     console.log(q);
  } else {
     console.log(data);
  }
}
run();
