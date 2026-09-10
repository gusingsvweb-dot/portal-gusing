import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkSchema() {
  const { data, error } = await supabase.from('NO_solicitudes').select('*').limit(1);
  if (error) {
    console.error(error);
  } else {
    console.log(data.length > 0 ? Object.keys(data[0]) : "Tabla vacia");
  }
}

checkSchema();
