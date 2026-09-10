import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkTicket() {
  const { data, error } = await supabase.from('NO_solicitudes').select('*').order('id', { ascending: false }).limit(5);
  if (error) {
    console.error(error);
  } else {
    console.log(data);
  }
}

checkTicket();
