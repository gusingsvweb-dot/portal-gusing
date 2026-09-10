import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// read .env
const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if(k) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: cols } = await supabase.rpc('get_table_columns_v2', { table_name: 'compras_ordenes_compra' });
  if(cols) console.log(cols);
  else {
    const { data: cols2, error } = await supabase.from('compras_ordenes_compra').select('*').limit(1);
    if(error) console.error(error);
    else console.log(cols2.length ? Object.keys(cols2[0]) : "no data");
  }
}
run();
