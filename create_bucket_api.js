import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.storage.createBucket('compras_adjuntos', {
    public: true,
    allowedMimeTypes: null,
    fileSizeLimit: null
  });
  console.log("Create Bucket Result:", data, error);
}
run();
