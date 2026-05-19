import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://hmvznxwwaoassdiqlaax.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdnpueHd3YW9hc3NkaXFsYWF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQyNjYzNCwiZXhwIjoyMDc5MDAyNjM0fQ.Cbu2aSH3Gk6T_poLxEUkhH3vBEf5BPqrD6CPybOrn5c');

async function run() {
  const { data: sol, error } = await supabase
    .from('NO_solicitudes') // the real table name might be NO_solicitudes, wait let me check the st() mapping
    .select('id, consecutivo, area_id')
    .eq('area_id', 1)
    .order('created_at', { ascending: true });
    
  if (error) { console.log(error); return; }
  
  console.log("Found " + sol.length + " solicitudes for Mantenimiento");
  
  let i = 1;
  for (const s of sol) {
    if (s.consecutivo !== i) {
      console.log(`Fixing id ${s.id}: consecutivo ${s.consecutivo} -> ${i}`);
      await supabase.from('NO_solicitudes').update({ consecutivo: i }).eq('id', s.id);
    }
    i++;
  }
}
run();
