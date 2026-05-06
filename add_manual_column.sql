-- Migration to add manual_url to activos table and tipo to proveedores_mant
ALTER TABLE activos ADD COLUMN IF NOT EXISTS manual_url TEXT;
ALTER TABLE proveedores_mant ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'Externo';

-- Instructions: 
-- 1. Run this SQL in your Supabase SQL Editor.
-- 2. Create a bucket named "manuales_equipos" in Supabase Storage with public access.
