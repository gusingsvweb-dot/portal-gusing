import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.rpc('get_table_columns_compras_ordenes_compra'); 
  // Let's just do a generic postgREST query using fetch to get openapi spec if possible? 
  // Or just try to insert something basic and catch the error
  const res = await supabase.from('compras_ordenes_compra').insert({}).select();
  console.log("Insert Error:", res.error);
}
run();
