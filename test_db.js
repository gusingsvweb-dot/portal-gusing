import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: cols2 } = await supabase.from('compras_ordenes_compra').select('*').limit(1);
  console.log(cols2 ? Object.keys(cols2[0] || {}) : "no data");
}
run();
