import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Flame, Wind, Gauge, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const GlobalAlertListener = () => {
  const navigate = useNavigate();
  const shownAlerts = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleAlert = async (payload: any, isUpdate: boolean = false) => {
      const alert = payload.new;
      // Only show notification once per location, or if it's an update to existing alert
      const locationKey = alert.location_id;
      if (!isUpdate && shownAlerts.current.has(locationKey)) {
        return;
      }
      
      // Mark this location as having shown an alert
      shownAlerts.current.add(locationKey);
      
      // Fetch location name
      const { data: location } = await supabase
        .from('locations')
        .select('name')
        .eq('id', alert.location_id)
        .single();

      const locationName = location?.name || 'Unknown Location';
      
      // Determine icon and title based on alert type
      let title = '';
      
      switch (alert.alert_type) {
        case 'fire':
          title = isUpdate ? '🔥 FIRE ALERT UPDATED' : '🔥 FIRE DETECTED';
          break;
        case 'gas_leak':
          title = isUpdate ? '💨 GAS LEAK UPDATED' : '💨 GAS LEAK DETECTED';
          break;
        case 'temperature':
          title = isUpdate ? '🌡️ TEMPERATURE UPDATED' : '🌡️ HIGH TEMPERATURE';
          break;
        default:
          title = isUpdate ? '⚠️ ALERT UPDATED' : '⚠️ ALERT';
      }

      // Show toast notification (persists until manually dismissed)
      toast({
        title,
        description: `${locationName} - ${alert.severity.toUpperCase()} severity`,
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

      // Play alert sound only for new alerts, not updates
      if (!isUpdate) {
        try {
          const audio = new Audio('/alert-sound.mp3');
          audio.play().catch(() => {
            // Silently fail if audio cannot be played
          });
        } catch (error) {
          // Silently fail if audio cannot be played
        }
      }
    };

    const channel = supabase
      .channel('global-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts'
        },
        (payload) => handleAlert(payload, false)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'alerts'
        },
        (payload) => handleAlert(payload, true)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate]);

  return null;
};
