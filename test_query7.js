import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hmvznxwwaoassdiqlaax.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdnpueHd3YW9hc3NkaXFsYWF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQyNjYzNCwiZXhwIjoyMDc5MDAyNjM0fQ.Cbu2aSH3Gk6T_poLxEUkhH3vBEf5BPqrD6CPybOrn5c';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('NO_solicitudes')
    .select(`
      *,
      compras_solicitudes_detalle!inner ( * ),
      compras_solicitud_items ( * ),
      compras_cotizaciones (
        *,
        compras_proveedores ( razon_social, nit_cedula )
      )
    `)
    .limit(1);

  if (error) console.error("Error with relations:", error);
  else console.log("Relations OK:", data.length);
}
run();
