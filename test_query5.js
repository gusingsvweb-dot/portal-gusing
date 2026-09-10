import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hmvznxwwaoassdiqlaax.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdnpueHd3YW9hc3NkaXFsYWF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQyNjYzNCwiZXhwIjoyMDc5MDAyNjM0fQ.Cbu2aSH3Gk6T_poLxEUkhH3vBEf5BPqrD6CPybOrn5c';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const { data, error } = await supabase.from('NO_solicitudes').select(`*, NO_estados(*)`).limit(1);
  if (error) console.error("Error NO_estados:", error);
  else console.log("NO_estados OK");

  const { data: d2, error: e2 } = await supabase.from('NO_solicitudes').select(`*, estados(*)`).limit(1);
  if (e2) console.error("Error estados:", e2);
  else console.log("estados OK");
}
run();
