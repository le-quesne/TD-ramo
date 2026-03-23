-- ============================================
-- Fleet Tracker - Schema inicial
-- ============================================

-- Perfiles de usuario (extiende auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('driver', 'admin')) DEFAULT 'driver',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'driver')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Estado en tiempo real de cada conductor
CREATE TABLE drivers (
  id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('stopped', 'driving')) DEFAULT 'stopped',
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  destination_name TEXT,
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger: crear fila en drivers cuando se crea un perfil con role='driver'
CREATE OR REPLACE FUNCTION handle_new_driver()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'driver' THEN
    INSERT INTO drivers (id) VALUES (NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_new_driver();

-- Viajes
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  destination_name TEXT,
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')) DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

-- Puntos de ruta (breadcrumbs GPS)
CREATE TABLE route_points (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_route_points_trip_id ON route_points(trip_id);
CREATE INDEX idx_route_points_recorded_at ON route_points(trip_id, recorded_at);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins read all profiles"
  ON profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- DRIVERS
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers update own"
  ON drivers FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Drivers read own"
  ON drivers FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins read all drivers"
  ON drivers FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- TRIPS
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers manage own trips"
  ON trips FOR ALL
  USING (auth.uid() = driver_id);

CREATE POLICY "Admins read all trips"
  ON trips FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ROUTE_POINTS
ALTER TABLE route_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers insert own route_points"
  ON route_points FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM trips WHERE trips.id = route_points.trip_id AND trips.driver_id = auth.uid()));

CREATE POLICY "Drivers read own route_points"
  ON route_points FOR SELECT
  USING (EXISTS (SELECT 1 FROM trips WHERE trips.id = route_points.trip_id AND trips.driver_id = auth.uid()));

CREATE POLICY "Admins read all route_points"
  ON route_points FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- Supabase Realtime
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE drivers;
