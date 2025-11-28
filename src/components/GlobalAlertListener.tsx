import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Flame, Wind, Gauge, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const GlobalAlertListener = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const channel = supabase
      .channel('global-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts'
        },
        async (payload) => {
          const newAlert = payload.new;
          
          // Fetch location name
          const { data: location } = await supabase
            .from('locations')
            .select('name')
            .eq('id', newAlert.location_id)
            .single();

          const locationName = location?.name || 'Unknown Location';
          
          // Determine icon and title based on alert type
          let icon;
          let title = '';
          
          switch (newAlert.alert_type) {
            case 'fire':
              icon = Flame;
              title = '🔥 FIRE DETECTED';
              break;
            case 'gas_leak':
              icon = Wind;
              title = '💨 GAS LEAK DETECTED';
              break;
            case 'temperature':
              icon = Gauge;
              title = '🌡️ HIGH TEMPERATURE';
              break;
            default:
              icon = AlertTriangle;
              title = '⚠️ ALERT';
          }

          // Show toast notification
          toast({
            title,
            description: `${locationName} - ${newAlert.severity.toUpperCase()} severity`,
            variant: "destructive",
            duration: 10000,
            action: (
              <button
                onClick={() => navigate(`/alert/${newAlert.id}`)}
                className="px-3 py-2 text-sm font-medium bg-white text-destructive rounded-md hover:bg-white/90 transition-colors"
              >
                View Details
              </button>
            ),
          });

          // Play alert sound (optional)
          try {
            const audio = new Audio('/alert-sound.mp3');
            audio.play().catch(() => {
              // Silently fail if audio cannot be played
            });
          } catch (error) {
            // Silently fail if audio cannot be played
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate]);

  return null;
};
