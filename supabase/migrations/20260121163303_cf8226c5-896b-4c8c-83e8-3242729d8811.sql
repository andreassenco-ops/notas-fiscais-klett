-- Add lock columns to whatsapp_session for distributed locking
ALTER TABLE public.whatsapp_session 
ADD COLUMN IF NOT EXISTS lock_holder TEXT,
ADD COLUMN IF NOT EXISTS lock_acquired_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient lock queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_session_lock ON public.whatsapp_session(lock_holder, lock_expires_at);

-- Function to acquire lock (atomic operation)
CREATE OR REPLACE FUNCTION public.acquire_whatsapp_lock(p_holder TEXT, p_duration_seconds INTEGER DEFAULT 300)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_acquired BOOLEAN := FALSE;
BEGIN
  -- Try to acquire lock only if no valid lock exists
  UPDATE whatsapp_session
  SET 
    lock_holder = p_holder,
    lock_acquired_at = NOW(),
    lock_expires_at = NOW() + (p_duration_seconds || ' seconds')::INTERVAL
  WHERE 
    lock_holder IS NULL 
    OR lock_expires_at < NOW()
    OR lock_holder = p_holder
  RETURNING TRUE INTO v_acquired;
  
  RETURN COALESCE(v_acquired, FALSE);
END;
$$;

-- Function to release lock
CREATE OR REPLACE FUNCTION public.release_whatsapp_lock(p_holder TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_released BOOLEAN := FALSE;
BEGIN
  UPDATE whatsapp_session
  SET 
    lock_holder = NULL,
    lock_acquired_at = NULL,
    lock_expires_at = NULL
  WHERE lock_holder = p_holder
  RETURNING TRUE INTO v_released;
  
  RETURN COALESCE(v_released, FALSE);
END;
$$;

-- Function to renew lock (extend expiration)
CREATE OR REPLACE FUNCTION public.renew_whatsapp_lock(p_holder TEXT, p_duration_seconds INTEGER DEFAULT 300)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_renewed BOOLEAN := FALSE;
BEGIN
  UPDATE whatsapp_session
  SET lock_expires_at = NOW() + (p_duration_seconds || ' seconds')::INTERVAL
  WHERE lock_holder = p_holder
  RETURNING TRUE INTO v_renewed;
  
  RETURN COALESCE(v_renewed, FALSE);
END;
$$;