import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SensorCard } from "@/components/SensorCard";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Navigation, RefreshCw, Flame, Wind, Thermometer, Droplets, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface Location {
  id: string;
  name: string;
  region: string;
  status: "normal" | "warning" | "alert";
  latitude: number;
  longitude: number;
  thingspeak_channel_id: string | null;
  thingspeak_read_key: string | null;
}

interface SensorData {
  flame: string;
  gas: number;
  temperature: number;
  humidity: number;
  pir: string;
  timestamp: string;
}

interface HistoricalData {
  timestamp: string;
  flame: number;
  gas: number;
  temperature: number;
  humidity: number;
}

const LocationDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [location, setLocation] = useState<Location | null>(null);
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalData[]>([]);
  const [rawData, setRawData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchLocationData();
    const interval = setInterval(fetchSensorData, 10000);
    return () => clearInterval(interval);
  }, [id]);

  const fetchLocationData = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setLocation(data as Location);
      
      if (data.thingspeak_channel_id && data.thingspeak_read_key) {
        await fetchSensorData();
        await fetchHistoricalData();
      }
    } catch (error) {
      toast({
        title: "Error fetching location",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSensorData = async () => {
    if (!location?.thingspeak_channel_id || !location?.thingspeak_read_key) return;

    try {
      const { data, error } = await supabase.functions.invoke("thingspeak-service", {
        body: {
          action: "latest",
          location: {
            thingspeak_channel_id: location.thingspeak_channel_id,
            thingspeak_read_key: location.thingspeak_read_key,
          },
        },
      });

      if (error) throw error;
      if (data.success) {
        setSensorData(data.data);
        setRawData(data.data);
      }
    } catch (error) {
      console.error("Error fetching sensor data:", error);
    }
  };

  const fetchHistoricalData = async () => {
    if (!location?.thingspeak_channel_id || !location?.thingspeak_read_key) return;

    try {
      const { data, error } = await supabase.functions.invoke("thingspeak-service", {
        body: {
          action: "history",
          location: {
            thingspeak_channel_id: location.thingspeak_channel_id,
            thingspeak_read_key: location.thingspeak_read_key,
          },
          results: 50,
        },
      });

      if (error) throw error;
      if (data.success) {
        const formattedData = data.data.map((item: any) => ({
          timestamp: new Date(item.timestamp).toLocaleTimeString(),
          flame: parseFloat(item.flame) || 0,
          gas: item.gas || 0,
          temperature: item.temperature || 0,
          humidity: item.humidity || 0,
        }));
        setHistoricalData(formattedData);
      }
    } catch (error) {
      console.error("Error fetching historical data:", error);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchSensorData();
    await fetchHistoricalData();
    setIsRefreshing(false);
    toast({
      title: "Data refreshed",
      description: "Sensor data has been updated",
    });
  };

  const handleNavigate = () => {
    if (location) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`,
        "_blank"
      );
    }
  };

  const getSensorStatus = (value: number, thresholds: { warning: number; danger: number }) => {
    if (value >= thresholds.danger) return "danger";
    if (value >= thresholds.warning) return "warning";
    return "normal";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center text-muted-foreground">Loading location data...</div>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center text-muted-foreground">Location not found</div>
      </div>
    );
  }

  const statusConfig = {
    normal: { color: "bg-status-normal", label: "Normal", variant: "secondary" as const },
    warning: { color: "bg-status-warning", label: "Warning", variant: "default" as const },
    alert: { color: "bg-status-alert", label: "Alert", variant: "destructive" as const },
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate("/locations")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{location.name}</h1>
                <p className="text-sm text-muted-foreground">{location.region}</p>
              </div>
              <Badge variant={statusConfig[location.status].variant}>
                {statusConfig[location.status].label}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button onClick={handleNavigate}>
                <Navigation className="h-4 w-4 mr-2" />
                Navigate
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {!location.thingspeak_channel_id ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No ThingSpeak channel configured for this location.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Live Sensor Readings</CardTitle>
              </CardHeader>
              <CardContent>
                {sensorData ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <SensorCard
                      title="Flame Sensor"
                      value={sensorData.flame}
                      icon={Flame}
                      status={getSensorStatus(parseFloat(sensorData.flame), { warning: 20, danger: 50 })}
                    />
                    <SensorCard
                      title="Gas Level"
                      value={sensorData.gas}
                      unit="ppm"
                      icon={Wind}
                      status={getSensorStatus(sensorData.gas, { warning: 300, danger: 500 })}
                    />
                    <SensorCard
                      title="Temperature"
                      value={sensorData.temperature}
                      unit="°C"
                      icon={Thermometer}
                      status={getSensorStatus(sensorData.temperature, { warning: 40, danger: 60 })}
                    />
                    <SensorCard
                      title="Humidity"
                      value={sensorData.humidity}
                      unit="%"
                      icon={Droplets}
                      status={getSensorStatus(sensorData.humidity, { warning: 70, danger: 85 })}
                    />
                    <SensorCard
                      title="Motion Detected"
                      value={sensorData.pir === "1" ? "Yes" : "No"}
                      icon={Eye}
                      status={sensorData.pir === "1" ? "warning" : "normal"}
                    />
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading sensor data...
                  </div>
                )}
              </CardContent>
            </Card>

            <Tabs defaultValue="charts" className="space-y-4">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="charts">Trend Charts</TabsTrigger>
                <TabsTrigger value="raw">Raw Data</TabsTrigger>
              </TabsList>

              <TabsContent value="charts" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Flame Sensor Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{
                        flame: {
                          label: "Flame",
                          color: "hsl(var(--chart-1))",
                        },
                      }}
                      className="h-[300px]"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historicalData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="timestamp" />
                          <YAxis />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Legend />
                          <Line type="monotone" dataKey="flame" stroke="hsl(var(--chart-1))" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Gas Level Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{
                        gas: {
                          label: "Gas (ppm)",
                          color: "hsl(var(--chart-2))",
                        },
                      }}
                      className="h-[300px]"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historicalData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="timestamp" />
                          <YAxis />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Legend />
                          <Line type="monotone" dataKey="gas" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Temperature & Humidity Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{
                        temperature: {
                          label: "Temperature (°C)",
                          color: "hsl(var(--chart-3))",
                        },
                        humidity: {
                          label: "Humidity (%)",
                          color: "hsl(var(--chart-4))",
                        },
                      }}
                      className="h-[300px]"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historicalData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="timestamp" />
                          <YAxis />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Legend />
                          <Line type="monotone" dataKey="temperature" stroke="hsl(var(--chart-3))" strokeWidth={2} />
                          <Line type="monotone" dataKey="humidity" stroke="hsl(var(--chart-4))" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="raw">
                <Card>
                  <CardHeader>
                    <CardTitle>Raw JSON Data</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[600px]">
                      {JSON.stringify(rawData, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <Card className="bg-primary/5">
              <CardHeader>
                <CardTitle>User Guidance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  <strong>Navigation:</strong> Use the "Navigate" button to get Google Maps directions to this location.
                </p>
                <p className="text-sm">
                  <strong>Refresh:</strong> Click "Refresh" to manually update sensor readings.
                </p>
                <p className="text-sm">
                  <strong>Charts:</strong> View historical trends to identify patterns and anomalies.
                </p>
                <p className="text-sm">
                  <strong>Raw Data:</strong> Access complete sensor data in JSON format for debugging.
                </p>
                <p className="text-sm text-muted-foreground mt-4">
                  Note: Data automatically refreshes every 10 seconds when viewing this page.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

export default LocationDetails;
