
ALTER TABLE public.broadcasts 
ADD COLUMN IF NOT EXISTS delay_min_seconds integer NOT NULL DEFAULT 10,
ADD COLUMN IF NOT EXISTS delay_max_seconds integer NOT NULL DEFAULT 20,
ADD COLUMN IF NOT EXISTS last_message_preview text;

ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_message_preview text;
