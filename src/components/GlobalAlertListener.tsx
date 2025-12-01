import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export const GlobalAlertListener = () => {
  const navigate = useNavigate();
  const shownAlerts = useRef<Set<string>>(new Set());

  useEffect(() => {
    const showAlertToast = async (alert: any) => {
      if (!alert) return;

      const alertId = String(alert.id);
      const status = (alert.status as string | null) ?? "active";

      console.log("GlobalAlertListener processing alert:", {
        alertId,
        status,
        type: alert.alert_type,
        alreadyShown: shownAlerts.current.has(alertId),
      });

      // If alert has been closed / moved out of live cases, dismiss any existing toast
      if (status === "resolved" || status === "unsolved" || status === "false_alarm") {
        toast.dismiss(alertId);
        shownAlerts.current.delete(alertId);
        return;
      }

      // Only show notifications for active / in-queue alerts
      if (status !== "active" && status !== "in_queue") {
        return;
      }

      // If we've already shown this alert, skip
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

      const description = `Location: ${locationName} | Severity: ${String(alert.severity ?? "").toUpperCase()}`;

      console.log("Creating sonner toast for alert:", alertId, title);

      // Use sonner toast with infinite duration
      toast.error(title, {
        id: alertId,
        description,
        duration: Infinity,
        action: {
          label: "View Details",
          onClick: () => navigate(`/alert/${alert.id}`),
        },
        onDismiss: () => {
          shownAlerts.current.delete(alertId);
        },
      });

      // Play alert sound
      try {
        const audio = new Audio("/alert-sound.mp3");
        audio.play().catch(() => {});
      } catch {
        // Ignore audio errors
      }
    };

    const handleAlert = async (payload: any) => {
      const alert = payload.new;
      showAlertToast(alert);
    };

    // Fetch existing active alerts on mount
    const fetchExistingAlerts = async () => {
      console.log("Fetching existing active alerts...");
      const { data: alerts, error } = await supabase
        .from("alerts")
        .select("*")
        .in("status", ["active", "in_queue"])
        .order("created_at", { ascending: false });

      console.log("Fetched alerts:", alerts?.length, error);

      if (alerts && alerts.length > 0) {
        // Only show toast for the most recent alert per location
        const seenLocations = new Set<string>();
        for (const alert of alerts) {
          if (!seenLocations.has(alert.location_id)) {
            seenLocations.add(alert.location_id);
            await showAlertToast(alert);
          }
        }
      }
    };

    fetchExistingAlerts();

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
