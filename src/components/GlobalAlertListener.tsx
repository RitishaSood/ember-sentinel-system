import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export const GlobalAlertListener = () => {
  const navigate = useNavigate();
  // Track by location_id to ensure only one alert per location
  const shownLocations = useRef<Set<string>>(new Set());

  useEffect(() => {
    const showAlertToast = async (alert: any) => {
      if (!alert) return;

      const locationId = String(alert.location_id);
      const status = (alert.status as string | null) ?? "active";

      // If alert has been resolved, dismiss toast for that location
      if (status === "resolved" || status === "unsolved" || status === "false_alarm") {
        toast.dismiss(locationId);
        shownLocations.current.delete(locationId);
        return;
      }

      // Only show for active / in-queue alerts
      if (status !== "active" && status !== "in_queue") {
        return;
      }

      // Only one alert per location
      if (shownLocations.current.has(locationId)) {
        return;
      }

      shownLocations.current.add(locationId);

      // Fetch location name
      const { data: location } = await supabase
        .from("locations")
        .select("name")
        .eq("id", alert.location_id)
        .single();

      const locationName = location?.name || "Unknown Location";

      // Determine alert type display
      let typeDisplay = "";
      switch (alert.alert_type) {
        case "fire":
          typeDisplay = "FIRE";
          break;
        case "gas_leak":
          typeDisplay = "GAS LEAK";
          break;
        case "temperature":
          typeDisplay = "HIGH TEMPERATURE";
          break;
        default:
          typeDisplay = alert.alert_type?.toUpperCase() || "ALERT";
      }

      // Show toast with custom styling
      toast.custom(
        (t) => (
          <div
            className="bg-black text-white p-4 rounded-lg shadow-2xl border border-gray-700 min-w-[300px] cursor-pointer"
            onClick={() => navigate(`/alert/${alert.id}`)}
          >
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-red-500">
                  🔥 FIRE DETECTED!
                </h3>
                <p className="text-sm">
                  <span className="text-gray-400">LOCATION:</span>{" "}
                  <span className="font-semibold">{locationName}</span>
                </p>
                <p className="text-sm">
                  <span className="text-gray-400">TYPE:</span>{" "}
                  <span className="font-semibold">{typeDisplay}</span>
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.dismiss(t);
                  shownLocations.current.delete(locationId);
                }}
                className="text-gray-400 hover:text-white text-xl font-bold ml-4"
              >
                ✕
              </button>
            </div>
          </div>
        ),
        {
          id: locationId,
          duration: Infinity,
        }
      );

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

    // Fetch existing active alerts on mount - one per location
    const fetchExistingAlerts = async () => {
      const { data: alerts } = await supabase
        .from("alerts")
        .select("*")
        .in("status", ["active", "in_queue"])
        .order("created_at", { ascending: false });

      if (alerts && alerts.length > 0) {
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
