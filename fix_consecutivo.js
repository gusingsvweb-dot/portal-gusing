const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://jllxyszyyswtdlshjmdk.supabase.co', process.env.SUPABASE_KEY);

async function run() {
  const { data: sol, error } = await supabase
    .from('solicitudes')
    .select('id, consecutivo, area_id')
    .eq('area_id', 1)
    .order('created_at', { ascending: true });
    
  if (error) { console.log(error); return; }
  
  console.log("Found " + sol.length + " solicitudes for Mantenimiento");
  
  let i = 1;
  for (const s of sol) {
    if (s.consecutivo !== i) {
      console.log(`Fixing id ${s.id}: consecutivo ${s.consecutivo} -> ${i}`);
      // await supabase.from('solicitudes').update({ consecutivo: i }).eq('id', s.id);
    }
    i++;
  }
}
run();
