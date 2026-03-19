import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Workspace {
  id: string;
  name: string;
  owner_id: string;
}

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadWorkspace() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Get workspace via membership
      const { data: members } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1);

      if (members && members.length > 0) {
        const { data: ws } = await supabase
          .from("workspaces")
          .select("id, name, owner_id")
          .eq("id", members[0].workspace_id)
          .single();
        setWorkspace(ws);
      } else {
        // Check if owner
        const { data: owned } = await supabase
          .from("workspaces")
          .select("id, name, owner_id")
          .eq("owner_id", user.id)
          .limit(1);
        if (owned && owned.length > 0) {
          setWorkspace(owned[0]);
        }
      }
      setLoading(false);
    }

    loadWorkspace();
  }, []);

  return { workspace, loading };
}
