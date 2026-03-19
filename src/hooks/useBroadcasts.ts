import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Broadcast {
  id: string;
  name: string;
  message: string;
  status: string;
  created_at: string | null;
  sent_at: string | null;
  total_recipients: number | null;
  total_sent: number | null;
  total_failed: number | null;
  total_delivered: number | null;
  total_read: number | null;
  delay_min_seconds: number;
  delay_max_seconds: number;
  workspace_id: string | null;
}

export function useBroadcasts(workspaceId: string | null) {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBroadcasts = useCallback(async () => {
    if (!workspaceId) return;
    const { data } = await supabase
      .from("broadcasts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    setBroadcasts((data as any[]) || []);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    fetchBroadcasts();
  }, [fetchBroadcasts]);

  const createBroadcast = useCallback(
    async (params: {
      name: string;
      message: string;
      contactIds: string[];
      delayMin: number;
      delayMax: number;
    }) => {
      if (!workspaceId) throw new Error("No workspace");

      const { data: broadcast, error } = await supabase
        .from("broadcasts")
        .insert({
          name: params.name,
          message: params.message,
          workspace_id: workspaceId,
          status: "draft",
          contacts_count: params.contactIds.length,
          total_recipients: params.contactIds.length,
          delay_min_seconds: params.delayMin,
          delay_max_seconds: params.delayMax,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Create recipients
      const recipientRows = params.contactIds.map((cid) => ({
        broadcast_id: broadcast!.id,
        contact_id: cid,
        status: "pending",
      }));

      await supabase.from("broadcast_recipients").insert(recipientRows);

      return broadcast!.id;
    },
    [workspaceId]
  );

  const startBroadcast = useCallback(async (broadcastId: string) => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/broadcast-send`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcast_id: broadcastId }),
      }
    );
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed to start broadcast");
    return result;
  }, []);

  const deleteBroadcast = useCallback(
    async (broadcastId: string) => {
      // Delete children first
      await supabase
        .from("broadcast_recipients")
        .delete()
        .eq("broadcast_id", broadcastId);

      await supabase
        .from("broadcast_contacts")
        .delete()
        .eq("broadcast_id", broadcastId);

      const { error } = await supabase
        .from("broadcasts")
        .delete()
        .eq("id", broadcastId);

      if (error) throw error;

      setBroadcasts((prev) => prev.filter((b) => b.id !== broadcastId));
      toast.success("Campanha excluída");
    },
    []
  );

  return {
    broadcasts,
    loading,
    createBroadcast,
    startBroadcast,
    deleteBroadcast,
    refetch: fetchBroadcasts,
  };
}
