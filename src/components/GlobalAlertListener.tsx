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
      const alertId = alert.id;
      
      // For updates, only handle status changes to solved/unsolved (remove from shown list)
      if (isUpdate) {
        if (alert.status === 'solved' || alert.status === 'unsolved') {
          shownAlerts.current.delete(alertId);
        }
        return; // Don't show notifications for updates
      }
      
      // Only show notification once per alert ID and only for active alerts
      if (shownAlerts.current.has(alertId) || alert.status !== 'active') {
        return;
      }
      
      // Mark this alert as shown
      shownAlerts.current.add(alertId);
      
      // Fetch location name
      const { data: location } = await supabase
        .from('locations')
        .select('name')
        .eq('id', alert.location_id)
        .single();

      const locationName = location?.name || 'Unknown Location';
      
      // Determine title based on alert type
      let title = '';
      
      switch (alert.alert_type) {
        case 'fire':
          title = '🔥 FIRE DETECTED';
          break;
        case 'gas_leak':
          title = '💨 GAS LEAK DETECTED';
          break;
        case 'temperature':
          title = '🌡️ HIGH TEMPERATURE';
          break;
        default:
          title = '⚠️ ALERT';
      }

      // Show toast notification (persists until manually dismissed)
      toast({
        title,
        description: `Location: ${locationName}\nSeverity: ${alert.severity.toUpperCase()}`,
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

      // Play alert sound for new alerts
      try {
        const audio = new Audio('/alert-sound.mp3');
        audio.play().catch(() => {
          // Silently fail if audio cannot be played
        });
      } catch (error) {
        // Silently fail if audio cannot be played
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
