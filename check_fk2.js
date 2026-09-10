import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('NO_solicitudes').select('*, estados:estados ( nombre )').limit(1);
  console.log("Error estados:", error?.message);
}
run();
