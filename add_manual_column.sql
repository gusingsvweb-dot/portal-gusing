-- Migration to add manual_url to activos table and create storage bucket
ALTER TABLE activos ADD COLUMN IF NOT EXISTS manual_url TEXT;

-- Instructions: Create a bucket named "manuales_equipos" in Supabase Storage with public access.
