import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkProduccion() {
    const { data, error } = await supabase
        .from("pedidos_produccion")
        .select(`
        *,
        productos (
          articulo,
          nombre_registro_lote,
          presentacion_comercial,
          forma_farmaceutica,
          referencia
        ),
        clientes ( nombre ),
        estados ( nombre )
    `)
        .limit(5);

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Success. Loaded:", data.length, "rows");
        if (data.length > 0) {
            console.log("First row products:", data[0].productos);
        }
    }
}

checkProduccion();
