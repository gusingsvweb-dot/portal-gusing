import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// read .env
const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if(k && k.trim()) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data } = await supabase.from('NO_usuarios').select('*').eq('usuario', 'juan.perez').single();
  console.log('juan.perez:', data);
}
run();
