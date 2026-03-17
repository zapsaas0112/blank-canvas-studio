
-- Allow workspace owners and admins to update workspace_members (role changes)
CREATE POLICY "Owners and admins can update workspace_members"
ON public.workspace_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_members.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role IN ('owner', 'admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_members.workspace_id
    AND w.owner_id = auth.uid()
  )
);

-- Allow workspace owners and admins to delete workspace_members (remove members)
CREATE POLICY "Owners and admins can delete workspace_members"
ON public.workspace_members
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = workspace_members.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role IN ('owner', 'admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_members.workspace_id
    AND w.owner_id = auth.uid()
  )
);

-- Allow workspace co-members to view each other's profiles (for team page and inbox)
CREATE POLICY "Workspace co-members can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_members my_wm
    JOIN public.workspace_members their_wm ON my_wm.workspace_id = their_wm.workspace_id
    WHERE my_wm.user_id = auth.uid()
    AND their_wm.user_id = profiles.user_id
  )
);

-- Enable realtime for broadcasts table
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcasts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_recipients;
