-- Add latitude and longitude to profiles table for fire station locations
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS fire_station_latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS fire_station_longitude DECIMAL(11, 8);

COMMENT ON COLUMN public.profiles.fire_station_latitude IS 'Latitude coordinate of the fire station';
COMMENT ON COLUMN public.profiles.fire_station_longitude IS 'Longitude coordinate of the fire station';