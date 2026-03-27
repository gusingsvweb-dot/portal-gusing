const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_URL';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_KEY';
const supa = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data } = await supa.from('usuarios').select('*');
  console.log("Usuarios:", data?.map(u => ({ id: u.id, rol: u.rol })));
}
test();
