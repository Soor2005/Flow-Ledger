-- ============================================================
-- Flow Ledger — Activation System Schema
-- Run this in: supabase.com → SQL Editor → New query
-- ============================================================

-- ─── PROFILES ────────────────────────────────────────────────────────────────
-- Linked to auth.users via user_id (Supabase Auth UUID).
-- Auto-created by trigger on new user registration.

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name        TEXT,
  email            TEXT,
  account_status   TEXT        NOT NULL DEFAULT 'pending_activation'
                   CHECK (account_status IN ('pending_activation', 'active', 'suspended', 'banned')),
  activation_key_id UUID,
  activated_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login       TIMESTAMPTZ
);

-- Index for fast status lookups
CREATE INDEX IF NOT EXISTS profiles_account_status ON public.profiles(account_status);

-- ─── ACTIVATION KEYS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activation_keys (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  activation_key TEXT        NOT NULL UNIQUE,
  status         TEXT        NOT NULL DEFAULT 'Available'
                 CHECK (status IN ('Available', 'Used', 'Expired', 'Disabled')),
  license_type   TEXT        NOT NULL DEFAULT 'standard',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,
  redeemed_by    UUID        REFERENCES auth.users(id),
  redeemed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS activation_keys_status    ON public.activation_keys(status);
CREATE INDEX IF NOT EXISTS activation_keys_redeemed  ON public.activation_keys(redeemed_by);
CREATE UNIQUE INDEX IF NOT EXISTS activation_keys_one_per_user
  ON public.activation_keys(redeemed_by)
  WHERE redeemed_by IS NOT NULL;

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_keys ENABLE ROW LEVEL SECURITY;

-- profiles: users can only read/update their own profile
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- activation_keys: authenticated users can select available keys for validation
-- (actual mutation is done by service-role in backend)
DROP POLICY IF EXISTS "activation_keys_select_auth" ON public.activation_keys;
CREATE POLICY "activation_keys_select_auth"
  ON public.activation_keys FOR SELECT
  TO authenticated
  USING (true);

-- ─── TRIGGER: AUTO-CREATE PROFILE ON SIGN UP ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, account_status, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    'pending_activation',
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── SAMPLE ACTIVATION KEYS (delete before production) ───────────────────────
-- INSERT INTO public.activation_keys (activation_key, status, license_type)
-- VALUES
--   ('FLOW-BETA-2024-XXXX', 'Available', 'beta'),
--   ('FLOW-BETA-2024-YYYY', 'Available', 'beta'),
--   ('FLOW-PREM-2024-ZZZZ', 'Available', 'premium');
