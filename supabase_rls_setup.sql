-- Final, Corrected, and Idempotent Schema & RLS Setup Script
-- This script cleans up the database and establishes the complete schema and RLS policies.
-- It is designed to be safely runnable multiple times.

-- Best-practice headers for transaction safety and role context
SET statement_timeout = '30s';
SET client_encoding = 'UTF8';
SET standard_conforming_strings = ON;
SET search_path TO public, extensions;

BEGIN;

-- SECTION 1: CLEANUP OLD OBJECTS
-- Drop old, conflicting, or redundant functions and triggers first.
DROP FUNCTION IF EXISTS public.create_company_and_assign_admin(text);
DROP FUNCTION IF EXISTS public.get_company_admin_dashboard();
DROP FUNCTION IF EXISTS public.change_user_role(uuid, user_role);
DROP FUNCTION IF EXISTS public.remove_user_from_company(uuid);
DROP FUNCTION IF EXISTS public.revoke_invitation(uuid);
DROP FUNCTION IF EXISTS public.create_new_company(text, text, text, integer, license_type);
DROP FUNCTION IF EXISTS public.request_session_access(text);
DROP FUNCTION IF EXISTS public.update_active_device(text);

-- Drop the redundant trigger on auth.users
DROP TRIGGER IF EXISTS on_new_auth_user_create_profile ON auth.users;

-- Drop dependent views that might block table alterations.
DROP VIEW IF EXISTS public.company_users;
DROP VIEW IF EXISTS public.company_members; -- Fix for 'cannot alter type' error

-- Drop all existing RLS policies on the tables we manage to ensure a clean slate.
-- The SELECT statement dynamically finds and drops policies.
-- Drop all existing RLS policies on the tables we manage to ensure a clean slate.
-- The SELECT statement dynamically finds and drops policies using format() for safety.
DO $$DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT format('DROP POLICY IF EXISTS %I ON public.%I', pol.polname, c.relname)
             FROM pg_policy pol
             JOIN pg_class c ON c.oid = pol.polrelid
             WHERE c.relname IN ('companies', 'profiles', 'licenses', 'photo_batches', 'photos', 'invitations', 'active_devices')
    LOOP
        EXECUTE r.format;
    END LOOP;
END$$;

-- SECTION 2: TYPE CREATION
-- Create all necessary custom ENUM types if they do not already exist.
DO $$BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'member');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'license_type') THEN
        CREATE TYPE public.license_type AS ENUM ('trial', 'basic', 'premium', 'enterprise');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'license_status') THEN
        CREATE TYPE public.license_status AS ENUM ('active', 'inactive', 'expired', 'cancelled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'batch_type') THEN
        CREATE TYPE public.batch_type AS ENUM ('Order', 'Inventory', 'QuickCapture');
    END IF;
END$$;

-- SECTION 3: TABLE DEFINITIONS & MIGRATIONS
-- Ensure core tables exist and have the correct structure.
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    role public.user_role DEFAULT 'member',
    full_name TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- This block ensures the 'profiles' table has the necessary columns.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='company_id') THEN
        ALTER TABLE public.profiles ADD COLUMN company_id UUID REFERENCES public.companies(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='role') THEN
        ALTER TABLE public.profiles ADD COLUMN role public.user_role DEFAULT 'member';
    ELSE
        ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'member';
        ALTER TABLE public.profiles ALTER COLUMN role TYPE public.user_role USING role::text::public.user_role;
    END IF;
END; $$;

-- Re-create other tables from scratch to ensure a clean state.
DROP TABLE IF EXISTS public.licenses CASCADE;
CREATE TABLE public.licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    type public.license_type NOT NULL,
    status public.license_status NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    licenses_available INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TABLE IF EXISTS public.photo_batches CASCADE;
CREATE TABLE public.photo_batches (
    id BIGSERIAL PRIMARY KEY,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    type public.batch_type NOT NULL DEFAULT 'QuickCapture',
    order_number TEXT,
    inventory_id TEXT,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TABLE IF EXISTS public.photos CASCADE;
CREATE TABLE public.photos (
    id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT REFERENCES public.photo_batches(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    storage_path TEXT NOT NULL,
    taken_at TIMESTAMPTZ,
    location JSONB,
    sync_status TEXT DEFAULT 'pending',
    remote_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TABLE IF EXISTS public.active_devices CASCADE;
CREATE TABLE public.active_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL,
  last_seen TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, device_id)
);

DROP TABLE IF EXISTS public.invitations CASCADE;
CREATE TABLE public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role public.user_role NOT NULL DEFAULT 'member',
    invited_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, email)
);

-- SECTION 4: FUNCTIONS & TRIGGERS
-- Non-recursive helper function to get the current user's company_id.
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid();
$$;

-- Function for admins to get company-wide statistics.
CREATE OR REPLACE FUNCTION public.get_company_stats()
RETURNS TABLE(
  total_users BIGINT,
  total_batches BIGINT,
  total_photos BIGINT,
  batches_today BIGINT,
  photos_today BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  requesting_user_company_id UUID := public.get_my_company_id();
BEGIN
  IF NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'User must be an admin or super_admin to access company stats.';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.profiles WHERE company_id = requesting_user_company_id) AS total_users,
    (SELECT COUNT(*) FROM public.photo_batches WHERE company_id = requesting_user_company_id) AS total_batches,
    (SELECT COUNT(*) FROM public.photos WHERE company_id = requesting_user_company_id) AS total_photos,
    (SELECT COUNT(*) FROM public.photo_batches WHERE company_id = requesting_user_company_id AND created_at >= timezone('utc', now())::date) AS batches_today,
    (SELECT COUNT(*) FROM public.photos WHERE company_id = requesting_user_company_id AND created_at >= timezone('utc', now())::date) AS photos_today;
END;
$$;

-- This function validates a device session against the company's license.
CREATE OR REPLACE FUNCTION public.request_session_access(p_device_id TEXT)
RETURNS TABLE(access_granted BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company_id UUID;
  v_license public.licenses;
  v_active_devices_count INT;
BEGIN
  -- Get the company_id for the currently authenticated user
  SELECT company_id INTO v_company_id FROM public.profiles WHERE id = auth.uid();

  IF v_company_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'User is not associated with a company.';
    RETURN;
  END IF;

  -- Get the company's license information
  SELECT * INTO v_license FROM public.licenses WHERE company_id = v_company_id;

  IF v_license IS NULL OR v_license.status <> 'active' THEN
    RETURN QUERY SELECT FALSE, 'Company license is inactive or expired.';
    RETURN;
  END IF;

  -- Count currently active devices for the company
  SELECT count(*) INTO v_active_devices_count FROM public.active_devices WHERE company_id = v_company_id;

  -- Check if the device is already registered
  IF NOT EXISTS (SELECT 1 FROM public.active_devices WHERE device_id = p_device_id AND company_id = v_company_id) THEN
    -- If it's a new device, check if there's an available license slot
    IF v_active_devices_count >= v_license.licenses_available THEN
      RETURN QUERY SELECT FALSE, 'All available licenses are in use. Please contact your administrator.';
      RETURN;
    END IF;
  END IF;

  -- If checks pass, upsert the device into the active_devices table
  INSERT INTO public.active_devices (company_id, user_id, device_id, last_seen)
  VALUES (v_company_id, auth.uid(), p_device_id, NOW())
  ON CONFLICT (company_id, device_id) DO UPDATE
  SET last_seen = NOW(), user_id = auth.uid();

  -- Grant access
  RETURN QUERY SELECT TRUE, 'Session access granted.';
END;
$$;

-- Helper function to check for admin or super_admin privileges.
CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.get_my_role() IN ('admin', 'super_admin');
$$;

-- Helper function to get the current user's role.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- This function handles new user sign-ups.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invitation_company_id UUID;
  invitation_role public.user_role;
  new_company_id UUID;
BEGIN
  SELECT company_id, role INTO invitation_company_id, invitation_role FROM public.invitations WHERE email = new.email;

  IF invitation_company_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, company_id, role) VALUES (new.id, invitation_company_id, invitation_role);
    UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('company_id', invitation_company_id, 'role', invitation_role) WHERE id = new.id;
    DELETE FROM public.invitations WHERE email = new.email;
  ELSE
    INSERT INTO public.companies (name) VALUES (new.raw_user_meta_data->>'full_name' || '''s Company') RETURNING id INTO new_company_id;
    INSERT INTO public.profiles (id, company_id, role) VALUES (new.id, new_company_id, 'admin');
    UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('company_id', new_company_id, 'role', 'admin') WHERE id = new.id;
    INSERT INTO public.licenses (company_id, type, status, licenses_available) VALUES (new_company_id, 'trial', 'active', 5);
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on the auth.users table.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- SECTION 5: ROW-LEVEL SECURITY (RLS) POLICIES
-- Enable RLS for all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_devices ENABLE ROW LEVEL SECURITY;

-- Policies for 'companies'
CREATE POLICY "Companies are visible to their members." ON public.companies
  FOR SELECT USING (id = public.get_my_company_id());

-- Policies for 'profiles' (NON-RECURSIVE)
CREATE POLICY "Users can view their own profile." ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can view profiles of others in their company." ON public.profiles
  FOR SELECT USING (company_id = public.get_my_company_id());

CREATE POLICY "Users can update their own profile." ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- Policies for 'licenses'
CREATE POLICY "Licenses are visible to company members." ON public.licenses
  FOR SELECT USING (company_id = public.get_my_company_id());

-- Policies for 'photo_batches'
CREATE POLICY "Batches are visible to and manageable by company members." ON public.photo_batches
  FOR ALL USING (company_id = public.get_my_company_id());

-- Policies for 'photos'
CREATE POLICY "Photos are visible to and manageable by company members." ON public.photos
  FOR ALL USING (EXISTS (SELECT 1 FROM public.photo_batches b WHERE b.id = batch_id AND b.company_id = public.get_my_company_id()));

-- Policies for 'invitations'
CREATE POLICY "Admins can manage invitations for their own company." ON public.invitations
  FOR ALL USING (company_id = public.get_my_company_id() AND public.is_admin_or_super_admin())
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin_or_super_admin());

-- Policies for 'active_devices'
CREATE POLICY "Users can manage their own active devices." ON public.active_devices
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admins can view their company's active devices." ON public.active_devices
  FOR SELECT USING (company_id = public.get_my_company_id() AND public.is_admin_or_super_admin());

-- SECTION 6: VIEWS
-- These views provide simplified and secure access to company-specific data.

CREATE OR REPLACE VIEW public.company_users AS
  SELECT p.id, u.email, p.full_name, p.role
  FROM public.profiles p
  JOIN auth.users u ON p.id = u.id
  WHERE p.company_id = public.get_my_company_id();

CREATE OR REPLACE VIEW public.company_licenses_view AS
  SELECT id, company_id, type AS license_type, status, expires_at, licenses_available
  FROM public.licenses
  WHERE company_id = public.get_my_company_id();

COMMIT;