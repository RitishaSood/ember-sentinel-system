import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Thermometer, Droplets, Flame, Wind, Eye } from "lucide-react";

interface SensorData {
  field1: number; // Temperature
  field2: number; // Humidity
  field3: string; // Flame (returns "FLAME" or "NO FLAME")
  field4: number; // Gas
  field5: string; // PIR (returns "0" for detected, "1" for none)
  created_at: string;
}

interface Location {
  id: string;
  name: string;
  region: string;
  thingspeak_channel_id: string;
  thingspeak_read_key: string;
}

const LocationsStatus = () => {
  const { toast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [sensorData, setSensorData] = useState<{ [key: string]: SensorData }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchLocations();
    
    // Set up automatic refresh every 30 seconds
    const interval = setInterval(() => {
      locations.forEach(location => {
        if (location.thingspeak_channel_id && location.thingspeak_read_key) {
          fetchSensorData(location.id, location.name, location.thingspeak_channel_id, location.thingspeak_read_key);
        }
      });
    }, 30000);

    // Set up real-time subscription for location updates
    const channel = supabase
      .channel('locations-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'locations'
        },
        (payload) => {
          console.log('Location status change detected:', payload);
          // Refresh sensor data for the changed location
          const updatedLocation = payload.new as Location | null;
          if (updatedLocation?.id) {
            const location = locations.find(loc => loc.id === updatedLocation.id);
            if (location && location.thingspeak_channel_id && location.thingspeak_read_key) {
              fetchSensorData(location.id, location.name, location.thingspeak_channel_id, location.thingspeak_read_key);
            }
          }
        }
      )
      .subscribe();
    
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [locations]);

  const fetchLocations = async () => {
    try {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .order("name");

      if (error) throw error;
      setLocations(data || []);

      // Fetch sensor data for all locations
      data?.forEach(location => {
        if (location.thingspeak_channel_id && location.thingspeak_read_key) {
          fetchSensorData(location.id, location.name, location.thingspeak_channel_id, location.thingspeak_read_key);
        }
      });
    } catch (error) {
      toast({
        title: "Error fetching locations",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const fetchSensorData = async (locationId: string, name: string, channelId: string, readKey: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('thingspeak-service', {
        body: {
          action: 'latest',
          location: {
            name,
            thingspeak_channel_id: channelId,
            thingspeak_read_key: readKey,
          }
        }
      });

      if (error) throw error;

      if (data.success && data.data) {
        setSensorData(prev => ({
          ...prev,
          [locationId]: {
            field1: data.data.temperature || 0,
            field2: data.data.humidity || 0,
            field3: data.data.flame || 0,
            field4: data.data.gas || 0,
            field5: data.data.pir || 0,
            created_at: data.data.timestamp,
          }
        }));

        // Automatically evaluate sensor data for alerts
        evaluateAlerts(locationId);
      }
    } catch (error) {
      console.error(`Error fetching sensor data for ${locationId}:`, error);
    } finally {
      setLoading(false);
    }
  };

  const evaluateAlerts = async (locationId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('alert-manager', {
        body: {
          action: 'evaluate',
          locationId: locationId
        }
      });

      if (error) {
        console.error('Error evaluating alerts:', error);
        return;
      }

      if (data?.created) {
        toast({
          title: "🚨 Alert Created!",
          description: `${data.alert.alert_type.toUpperCase()} detected - ${data.alert.severity} severity`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error calling alert-manager:', error);
    }
  };

  const refreshAll = () => {
    locations.forEach(location => {
      if (location.thingspeak_channel_id && location.thingspeak_read_key) {
        fetchSensorData(location.id, location.name, location.thingspeak_channel_id, location.thingspeak_read_key);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Locations Status</h1>
          <p className="text-muted-foreground">Real-time sensor data from all monitoring locations</p>
        </div>
        <Button onClick={refreshAll} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh All
        </Button>
      </div>

      <div className="grid gap-6">
        {locations.map(location => {
          const data = sensorData[location.id];
          
          return (
            <Card key={location.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{location.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{location.region}</p>
                  </div>
                  <Badge variant="outline">Channel: {location.thingspeak_channel_id}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {data ? (
                  <div className="grid gap-4 md:grid-cols-5">
                    <Card className="border-primary/20">
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Thermometer className="h-5 w-5 text-primary" />
                          <span className="font-medium">Temperature</span>
                        </div>
                        <p className="text-2xl font-bold">{data.field1}°C</p>
                      </CardContent>
                    </Card>

                    <Card className="border-primary/20">
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Droplets className="h-5 w-5 text-primary" />
                          <span className="font-medium">Humidity</span>
                        </div>
                        <p className="text-2xl font-bold">{data.field2}%</p>
                      </CardContent>
                    </Card>

                    <Card className={`border-primary/20 ${data.field3 === "FLAME" ? "bg-red-100 border-red-500" : ""}`}>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Flame className={`h-5 w-5 ${data.field3 === "FLAME" ? "text-red-600" : "text-destructive"}`} />
                          <span className="font-medium">Flame</span>
                          
                          {data.field3 === "FLAME" && (
                            <Badge variant="destructive" className="ml-auto animate-pulse">
                              🚨 Flame Detected
                            </Badge>
                          )}
                        </div>

                        <p className={`text-2xl font-bold ${data.field3 === "FLAME" ? "text-red-700" : ""}`}>
                          {data.field3 === "FLAME" ? "Detected" : "None"}
                        </p>
                      </CardContent>
                    </Card>


                    <Card className="border-primary/20">
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Wind className="h-5 w-5 text-status-warning" />
                          <span className="font-medium">Gas</span>
                        </div>
                        <p className="text-2xl font-bold">{data.field4}</p>
                      </CardContent>
                    </Card>

                    <Card className={`border-primary/20 ${data.field5 === "0" ? "bg-blue-100 border-blue-500" : ""}`}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Eye className={`h-5 w-5 ${data.field5 === "0" ? "text-blue-600" : "text-primary"}`} />
                          <span className="font-medium">PIR Motion</span>
                          
                          {data.field5 === "0" && (
                            <Badge variant="default" className="ml-auto animate-pulse bg-blue-600">
                              👁️ Motion Detected
                            </Badge>
                          )}
                        </div>
                        <p className={`text-2xl font-bold ${data.field5 === "0" ? "text-blue-700" : ""}`}>
                          {data.field5 === "0" ? "Detected" : "None"}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">Loading sensor data...</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default LocationsStatus;
