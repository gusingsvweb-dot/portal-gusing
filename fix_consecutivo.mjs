import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && k.trim()) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run(table) {
  // Get all with area_id = 1 ordered by id
  const { data, error } = await supabase.from(table).select('id, consecutivo').eq('area_id', 1).order('id', { ascending: true });
  if (error) { console.error(error); return; }
  
  let currentCons = 1;
  // If some already have consecutivo, we might want to respect them or just re-number everything?
  // Let's just assign consecutivo = currentCons++ for everyone to make it perfectly linear!
  
  for (const row of data) {
    console.log(`Updating ${table} ID ${row.id} to consecutivo ${currentCons}`);
    await supabase.from(table).update({ consecutivo: currentCons }).eq('id', row.id);
    currentCons++;
  }
}

async function main() {
  await run('solicitudes');
  await run('NO_solicitudes');
  console.log("Done");
}

main();
