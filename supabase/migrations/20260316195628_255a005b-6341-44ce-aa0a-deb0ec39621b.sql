-- Fix whatsapp_config overly permissive policy
DROP POLICY IF EXISTS "Authenticated can manage whatsapp_config" ON public.whatsapp_config;
CREATE POLICY "Authenticated can select whatsapp_config" ON public.whatsapp_config
FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert whatsapp_config" ON public.whatsapp_config
FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update whatsapp_config" ON public.whatsapp_config
FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete whatsapp_config" ON public.whatsapp_config
FOR DELETE TO authenticated USING (true);