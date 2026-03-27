import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkFormas() {
    const { data, error } = await supabase
        .from('productos')
        .select('forma_farmaceutica')
        .not('forma_farmaceutica', 'is', null)
        .limit(50);

    if (error) {
        console.error("Error:", error);
        return;
    }

    // Unique
    const formas = [...new Set(data.map(i => i.forma_farmaceutica))];
    console.log("Formas:", formas);
}

checkFormas();
