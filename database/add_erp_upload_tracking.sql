-- Add ERP upload tracking to photo_batches table
-- This tracks which batches have been uploaded to Salesforce/ERP to prevent duplicates

-- Add erp_uploaded flag to photo_batches table
ALTER TABLE public.photo_batches 
ADD COLUMN IF NOT EXISTS erp_uploaded BOOLEAN DEFAULT false;

-- Add timestamp for when the batch was uploaded to ERP
ALTER TABLE public.photo_batches 
ADD COLUMN IF NOT EXISTS erp_uploaded_at TIMESTAMP WITH TIME ZONE;

-- Add field to track which user uploaded to ERP
ALTER TABLE public.photo_batches 
ADD COLUMN IF NOT EXISTS erp_uploaded_by UUID REFERENCES auth.users(id);

-- Add field to track ERP record IDs (for traceability)
ALTER TABLE public.photo_batches 
ADD COLUMN IF NOT EXISTS erp_record_ids JSONB;

-- Add error tracking for failed uploads
ALTER TABLE public.photo_batches 
ADD COLUMN IF NOT EXISTS erp_upload_error TEXT;

-- Create indexes for faster queries on upload status
-- Using IF NOT EXISTS to handle repeated runs
CREATE INDEX IF NOT EXISTS idx_photo_batches_erp_uploaded 
ON public.photo_batches(erp_uploaded);

CREATE INDEX IF NOT EXISTS idx_photo_batches_company_erp_uploaded 
ON public.photo_batches(company_id, erp_uploaded);

-- Create function to mark batch as uploaded
CREATE OR REPLACE FUNCTION mark_batch_uploaded_to_erp(
    batch_id BIGINT,
    user_id UUID,
    record_ids JSONB DEFAULT NULL
) RETURNS void AS $$
BEGIN
    UPDATE public.photo_batches
    SET 
        erp_uploaded = true,
        erp_uploaded_at = NOW(),
        erp_uploaded_by = user_id,
        erp_record_ids = record_ids,
        erp_upload_error = NULL,
        updated_at = NOW()
    WHERE id = batch_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to mark batch upload as failed
CREATE OR REPLACE FUNCTION mark_batch_upload_failed(
    batch_id BIGINT,
    error_message TEXT
) RETURNS void AS $$
BEGIN
    UPDATE public.photo_batches
    SET 
        erp_uploaded = false,
        erp_upload_error = error_message,
        updated_at = NOW()
    WHERE id = batch_id;
END;
$$ LANGUAGE plpgsql;

-- Create view for batches pending ERP upload
-- Using CREATE OR REPLACE to handle if view already exists
CREATE OR REPLACE VIEW pending_erp_uploads AS
SELECT 
    pb.*,
    u.email as user_email,
    p.full_name as profile_name,
    COUNT(ph.id) as photo_count
FROM public.photo_batches pb
LEFT JOIN public.profiles p ON pb.user_id = p.id
LEFT JOIN auth.users u ON p.id = u.id
LEFT JOIN public.photos ph ON pb.id = ph.batch_id
WHERE pb.erp_uploaded = false
    AND pb.status = 'completed'  -- Only show completed batches
GROUP BY pb.id, u.email, p.full_name;

-- RLS policy to ensure users can only see their company's upload status
-- Drop existing policy if it exists
DROP POLICY IF EXISTS photo_batches_erp_upload_status ON public.photo_batches;

-- Create the policy
CREATE POLICY photo_batches_erp_upload_status ON public.photo_batches
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    );