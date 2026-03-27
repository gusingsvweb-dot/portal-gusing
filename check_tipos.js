import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkTipos() {
    const { data, error } = await supabase
        .from('tipos_solicitud')
        .select('*');

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("Tipos de Solicitud:", data);
}

checkTipos();
