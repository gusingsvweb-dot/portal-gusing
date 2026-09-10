import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase
      .from('NO_solicitudes')
      .select(`
        *,
        tipos_solicitud:NO_tipos_solicitud ( nombre ),
        prioridades:NO_prioridades ( nombre ),
        estados:NO_estados ( nombre ),
        areas:NO_areas ( nombre ),
        compras_solicitudes_detalle!inner ( * ),
        compras_solicitud_items ( * ),
        compras_cotizaciones (
          *,
          compras_proveedores ( razon_social, nit )
        )
      `)
      .in("estado_id", [14, 18, 19, 23, 24])
      .order("id", { ascending: false });
  console.log("Error:", error?.message);
  console.log("Data length:", data?.length);
}
run();
