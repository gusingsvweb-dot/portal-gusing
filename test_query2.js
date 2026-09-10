import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hmvznxwwaoassdiqlaax.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdnpueHd3YW9hc3NkaXFsYWF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQyNjYzNCwiZXhwIjoyMDc5MDAyNjM0fQ.Cbu2aSH3Gk6T_poLxEUkhH3vBEf5BPqrD6CPybOrn5c';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('NO_solicitudes')
    .select(`
      *,
      tipos_solicitud ( nombre ),
      prioridades ( nombre ),
      estados ( nombre ),
      areas ( nombre ),
      compras_solicitudes_detalle!inner ( * ),
      compras_solicitud_items ( * )
    `)
    .in("estado_id", [1, 14, 17, 18, 19, 23, 24]);

  if (error) {
    console.error("Exact query error:", error);
  } else {
    console.log("Data length:", data.length);
  }
}
run();
