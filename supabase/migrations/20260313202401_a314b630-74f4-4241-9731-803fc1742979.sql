
-- 1. Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  avatar_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), COALESCE(NEW.email, ''));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. User Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 3. Customers
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Conversations
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unassigned',
  last_message_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage conversations" ON public.conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_type text NOT NULL DEFAULT 'customer',
  sender_id uuid,
  content text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'text',
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage messages" ON public.messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Tags
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#25D366',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage tags" ON public.tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. Conversation Tags
CREATE TABLE public.conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  UNIQUE (conversation_id, tag_id)
);
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage conversation_tags" ON public.conversation_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. Quick Replies
CREATE TABLE public.quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  shortcut text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage quick_replies" ON public.quick_replies FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. Broadcasts
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message text NOT NULL,
  contacts_count int DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage broadcasts" ON public.broadcasts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 10. Broadcast Contacts
CREATE TABLE public.broadcast_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid REFERENCES public.broadcasts(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.broadcast_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage broadcast_contacts" ON public.broadcast_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 11. WhatsApp Config
CREATE TABLE public.whatsapp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text,
  api_url text,
  api_token text,
  is_active boolean DEFAULT false,
  webhook_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage whatsapp_config" ON public.whatsapp_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 12. Bot Configs
CREATE TABLE public.bot_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean DEFAULT false,
  welcome_message text,
  steps jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.bot_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage bot_configs" ON public.bot_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
