import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Flame, Wind, Gauge, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const GlobalAlertListener = () => {
  const navigate = useNavigate();
  const shownAlerts = useRef<Set<string>>(new Set());
  const alertToasts = useRef<Map<string, { dismiss: () => void }>>(new Map());

  useEffect(() => {
    const handleAlert = async (payload: any) => {
      const alert = payload.new;
      if (!alert) return;

      const alertId = String(alert.id);
      const status = (alert.status as string | null) ?? "active";

      console.log("GlobalAlertListener received alert:", {
        alertId,
        status,
        type: alert.alert_type,
      });

      // If alert has been closed / moved out of live cases, dismiss any existing toast
      if (status === "resolved" || status === "unsolved" || status === "false_alarm") {
        const existing = alertToasts.current.get(alertId);
        if (existing) {
          existing.dismiss();
          alertToasts.current.delete(alertId);
        }
        shownAlerts.current.delete(alertId);
        return;
      }

      // Only show notifications for active / in-queue alerts
      if (status !== "active" && status !== "in_queue") {
        return;
      }

      // If we've already shown this alert, keep the existing toast (no re-pop)
      if (shownAlerts.current.has(alertId)) {
        return;
      }

      shownAlerts.current.add(alertId);

      // Fetch location name for description
      const { data: location } = await supabase
        .from("locations")
        .select("name")
        .eq("id", alert.location_id)
        .single();

      const locationName = location?.name || "Unknown Location";

      // Determine title based on alert type
      let title = "";
      switch (alert.alert_type) {
        case "fire":
          title = "🔥 FIRE DETECTED";
          break;
        case "gas_leak":
          title = "💨 GAS LEAK DETECTED";
          break;
        case "temperature":
          title = "🌡️ HIGH TEMPERATURE";
          break;
        default:
          title = "⚠️ ALERT";
      }

      const description = `Location: ${locationName}\nSeverity: ${String(alert.severity ?? "").toUpperCase()}`;

      const handle = toast({
        title,
        description,
        variant: "destructive",
        action: (
          <button
            onClick={() => navigate(`/alert/${alert.id}`)}
            className="px-3 py-2 text-sm font-medium bg-white text-destructive rounded-md hover:bg-white/90 transition-colors"
          >
            View Details
          </button>
        ),
      });

      alertToasts.current.set(alertId, { dismiss: handle.dismiss });

      // Play alert sound when toast is first created
      try {
        const audio = new Audio("/alert-sound.mp3");
        audio.play().catch(() => {
          // Ignore audio errors
        });
      } catch {
        // Ignore audio errors
      }
    };

    const channel = supabase
      .channel("global-alerts")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alerts",
        },
        handleAlert
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate]);

  return null;
};
