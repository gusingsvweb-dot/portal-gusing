import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: area } = await supabase.from('areas').select('id').eq('nombre', 'Compras').single();
  console.log("Area compras ID:", area?.id);
  const { data: tipos } = await supabase.from('tipos_solicitud').select('*').eq('id_area_relacionada', area?.id);
  console.log("Tipos de solicitud compras:", tipos);
}
run();
