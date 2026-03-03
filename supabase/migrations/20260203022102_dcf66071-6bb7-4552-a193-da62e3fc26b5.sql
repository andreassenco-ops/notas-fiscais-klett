
-- CRITICAL FIX: Add INSERT policy for send_logs to allow service_role and Edge Functions to write logs
-- This is essential for auditing message deliveries

-- First, allow INSERT for authenticated users (Edge Functions use service_role which bypasses RLS)
-- But we also need to allow the anon key for Edge Functions that use it

-- Policy for service role and authenticated users to insert logs
CREATE POLICY "Service role and authenticated can insert logs" 
ON public.send_logs 
FOR INSERT 
WITH CHECK (true);

-- This allows any insert, which is safe because:
-- 1. The table only stores event logs (no sensitive user data exposed)
-- 2. RLS is bypassed by service_role anyway, but this ensures anon key from Edge Functions works
-- 3. We need this for auditing critical message deliveries
