-- Create bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('compras_adjuntos', 'compras_adjuntos', true)
ON CONFLICT (id) DO NOTHING;

-- Set up security policies for the bucket
-- Allow public access to view files
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'compras_adjuntos' );

-- Allow authenticated users to upload files
CREATE POLICY "Auth Upload" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'compras_adjuntos' AND auth.role() = 'authenticated' );

-- Allow authenticated users to delete files
CREATE POLICY "Auth Delete" 
ON storage.objects FOR DELETE 
USING ( bucket_id = 'compras_adjuntos' AND auth.role() = 'authenticated' );
