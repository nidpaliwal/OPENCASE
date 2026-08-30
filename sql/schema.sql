-- OPENCASE Database Schema for Supabase
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. PROFILES TABLE (extends Supabase auth.users)
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Anonymous',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'solver', 'admin')),
  avatar_url TEXT,
  bio TEXT,
  skills TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'Anonymous'), 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- 2. PROBLEMS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS problems (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'solved', 'flagged', 'removed')),
  posted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  posted_by_name TEXT NOT NULL DEFAULT 'Anonymous',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  bounty NUMERIC(10,2) NOT NULL DEFAULT 0,
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tags TEXT[] DEFAULT '{}',
  embedding VECTOR(384)
);

-- =============================================
-- 3. SOLUTIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS solutions (
  id BIGSERIAL PRIMARY KEY,
  problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  solver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  solver_name TEXT NOT NULL,
  text TEXT NOT NULL,
  ai_assisted BOOLEAN NOT NULL DEFAULT FALSE,
  accepted BOOLEAN NOT NULL DEFAULT FALSE,
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  removed BOOLEAN NOT NULL DEFAULT FALSE,
  quality_score NUMERIC(3,1) DEFAULT 0,
  blockchain_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 4. SOLVER RANKINGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS solver_rankings (
  id BIGSERIAL PRIMARY KEY,
  solver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  solver_name TEXT NOT NULL,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  total_solutions INTEGER NOT NULL DEFAULT 0,
  avg_quality NUMERIC(3,1) DEFAULT 0,
  rank_position INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(solver_id)
);

-- =============================================
-- 5. AI USAGE TRACKING
-- =============================================
CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  draft_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, usage_date)
);

-- =============================================
-- 6. ACTIVITY LOG
-- =============================================
CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  actor_name TEXT,
  actor_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- 7. BLOCKCHAIN VERIFICATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS blockchain_verifications (
  id BIGSERIAL PRIMARY KEY,
  solution_id BIGINT NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
  tx_hash TEXT NOT NULL,
  block_number BIGINT,
  network TEXT NOT NULL DEFAULT 'polygon-amoy',
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_problems_status ON problems(status);
CREATE INDEX IF NOT EXISTS idx_problems_category ON problems(category);
CREATE INDEX IF NOT EXISTS idx_problems_created ON problems(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_problems_posted_by ON problems(posted_by);
CREATE INDEX IF NOT EXISTS idx_solutions_problem ON solutions(problem_id);
CREATE INDEX IF NOT EXISTS idx_solutions_solver ON solutions(solver_id);
CREATE INDEX IF NOT EXISTS idx_solutions_accepted ON solutions(accepted) WHERE accepted = TRUE;
CREATE INDEX IF NOT EXISTS idx_solver_rankings_rank ON solver_rankings(accepted_count DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blockchain_solution ON blockchain_verifications(solution_id);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE solver_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockchain_verifications ENABLE ROW LEVEL SECURITY;

-- Profiles: public read, owner write
CREATE POLICY "Profiles are publicly readable" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Problems: public read, authenticated write
CREATE POLICY "Problems are publicly readable" ON problems FOR SELECT USING (status != 'removed');
CREATE POLICY "Authenticated users can create problems" ON problems FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Owners can update own problems" ON problems FOR UPDATE USING (auth.uid() = posted_by);
CREATE POLICY "Admins can update any problem" ON problems FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Solutions: public read, authenticated write
CREATE POLICY "Solutions are publicly readable" ON solutions FOR SELECT USING (NOT removed);
CREATE POLICY "Authenticated users can create solutions" ON solutions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Owners can update own solutions" ON solutions FOR UPDATE USING (auth.uid() = solver_id);

-- Solver rankings: public read
CREATE POLICY "Rankings are publicly readable" ON solver_rankings FOR SELECT USING (true);

-- AI usage: owner read/write
CREATE POLICY "Users can read own AI usage" ON ai_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own AI usage" ON ai_usage FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own AI usage" ON ai_usage FOR UPDATE USING (auth.uid() = user_id);

-- Activity log: public read, system write
CREATE POLICY "Activity log is publicly readable" ON activity_log FOR SELECT USING (true);

-- Blockchain verifications: public read
CREATE POLICY "Verifications are publicly readable" ON blockchain_verifications FOR SELECT USING (true);

-- =============================================
-- REALTIME SUBSCRIPTIONS
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE problems;
ALTER PUBLICATION supabase_realtime ADD TABLE solutions;
ALTER PUBLICATION supabase_realtime ADD TABLE solver_rankings;

-- =============================================
-- SEED DATA FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION seed_opencase_data()
RETURNS void AS $$
DECLARE
  v_user_id UUID;
  v_problem1_id BIGINT;
  v_problem2_id BIGINT;
  v_problem3_id BIGINT;
BEGIN
  -- Create a demo solver profile
  INSERT INTO profiles (id, display_name, role, skills)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Arjun', 'solver', ARRAY['civic-engagement', 'research', 'advocacy'])
  ON CONFLICT (id) DO NOTHING;

  v_user_id := '00000000-0000-0000-0000-000000000001';

  -- Seed problems
  INSERT INTO problems (title, description, category, status, posted_by_name, featured, bounty, created_at)
  VALUES
    ('Neighborhood park lights out for weeks', 'Streetlights along the riverside park have been dark for three weeks. Residents avoid the path after sunset and there have been two near-miss falls. The municipal helpline keeps closing tickets as "resolved" without fixing anything.', 'Civic / Local', 'solved', 'Priya', false, 0, NOW() - INTERVAL '6 days')
  RETURNING id INTO v_problem1_id;

  INSERT INTO problems (title, description, category, status, posted_by_name, featured, bounty, created_at)
  VALUES
    ('Family bakery drowning in order-tracking spreadsheets', 'We run a 6-person bakery doing ~80 custom orders weekly across WhatsApp, calls and walk-ins. Orders get lost, ingredients run out mid-week, and we have no view of margins per product. Excel templates we tried were too complex.', 'Business / Operations', 'open', 'Ravi', true, 120, NOW() - INTERVAL '2 days')
  RETURNING id INTO v_problem2_id;

  INSERT INTO problems (title, description, category, status, posted_by_name, featured, bounty, created_at)
  VALUES
    ('Apartment complex has no system for visitor parking disputes', '40-unit building, 6 visitor spots, constant arguments. The association wants a fair, low-effort booking or rotation method residents will actually follow.', 'Civic / Local', 'open', 'Meera', false, 25, NOW() - INTERVAL '8 hours')
  RETURNING id INTO v_problem3_id;

  -- Seed solution for problem 1
  INSERT INTO solutions (problem_id, solver_id, solver_name, text, ai_assisted, accepted, created_at)
  VALUES
    (v_problem1_id, v_user_id, 'Arjun', '1. File an RTI/request with the municipal electricity department citing the exact pole numbers and dates — this forces a written response.
2. Collect 10 resident signatures and photos with timestamps into a single one-page dossier.
3. Escalate through the ward officer with the dossier, cc''ing the local councillor.
4. In parallel, ask the residents'' association to install two solar motion-lights (~$30 each) on the darkest stretch as an interim measure.
5. Follow-up protocol: if no action in 15 days, escalate to the city commissioner''s grievance portal with the paper trail.', true, true, NOW() - INTERVAL '5 days');

  -- Update solver ranking
  INSERT INTO solver_rankings (solver_id, solver_name, accepted_count, total_solutions)
  VALUES (v_user_id, 'Arjun', 1, 1)
  ON CONFLICT (solver_id) DO UPDATE SET
    accepted_count = solver_rankings.accepted_count + 1,
    total_solutions = solver_rankings.total_solutions + 1;

  -- Log activity
  INSERT INTO activity_log (event_type, entity_type, entity_id, actor_name, metadata)
  VALUES
    ('created', 'problem', v_problem1_id, 'Priya', '{"title": "Neighborhood park lights out for weeks"}'),
    ('created', 'problem', v_problem2_id, 'Ravi', '{"title": "Family bakery drowning in order-tracking spreadsheets"}'),
    ('created', 'problem', v_problem3_id, 'Meera', '{"title": "Apartment complex has no system for visitor parking disputes"}'),
    ('solved', 'problem', v_problem1_id, 'Arjun', '{"solver": "Arjun"}');
END;
$$ LANGUAGE plpgsql;
