-- Fix: Allow workspace owners to SELECT their own workspace
-- The issue is .insert().select() needs SELECT too, but user_has_workspace_access
-- checks workspace_members which doesn't exist yet during creation.
DROP POLICY IF EXISTS "Users can view workspaces they belong to" ON public.workspaces;
CREATE POLICY "Users can view workspaces they belong to" ON public.workspaces
FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.user_has_workspace_access(id));