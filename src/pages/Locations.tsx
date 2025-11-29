import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LocationCard } from "@/components/LocationCard";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Location {
  id: string;
  name: string;
  region: string;
  status: "normal" | "warning" | "alert";
  latitude: number;
  longitude: number;
}

const Locations = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checkingLocation, setCheckingLocation] = useState<string | null>(null);

  useEffect(() => {
    fetchLocations();

    // Set up real-time subscription for location updates
    const channel = supabase
      .channel('locations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'locations'
        },
        (payload) => {
          console.log('Location change detected:', payload);
          fetchLocations(); // Refresh locations when any change occurs
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchLocations = async () => {
    try {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .order("name");

      if (error) throw error;

      setLocations((data || []) as Location[]);
    } catch (error) {
      toast({
        title: "Error fetching locations",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckSensors = async (locationId: string) => {
    setCheckingLocation(locationId);
    try {
      const { data, error } = await supabase.functions.invoke('alert-manager', {
        body: { action: 'evaluate', locationId }
      });

      if (error) throw error;

      if (data.success) {
        if (data.created) {
          toast({
            title: "Alert Created!",
            description: `New ${data.alert.alert_type} alert detected with ${data.alert.severity} severity.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Sensors Normal",
            description: data.message || "All sensors within normal range.",
          });
        }
        // Refresh locations to see updated status
        await fetchLocations();
      }
    } catch (error) {
      toast({
        title: "Error checking sensors",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCheckingLocation(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Monitoring Locations</h1>
              <p className="text-sm text-muted-foreground">
                Manage and view all sensor locations
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading locations...</div>
        ) : locations.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No locations configured yet.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {locations.map((location) => (
              <LocationCard 
                key={location.id} 
                {...location} 
                onCheckSensors={handleCheckSensors}
                isChecking={checkingLocation === location.id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Locations;
