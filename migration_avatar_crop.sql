ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_crop jsonb;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_avatar_crop_valid;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_crop_valid CHECK (
    avatar_crop IS NULL OR (
      jsonb_typeof(avatar_crop) = 'object'
      AND avatar_crop ?& ARRAY['x', 'y', 'zoom']
      AND (avatar_crop->>'x')::numeric BETWEEN 0 AND 100
      AND (avatar_crop->>'y')::numeric BETWEEN 0 AND 100
      AND (avatar_crop->>'zoom')::numeric BETWEEN 1 AND 2.5
    )
  );
