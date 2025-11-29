import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { Flame, AlertTriangle, Wind, Thermometer, Users } from "lucide-react";

interface Alert {
  id: string;
  location_id: string;
  alert_type: "fire" | "gas_leak" | "temperature" | "motion";
  timestamp: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "active" | "resolved" | "false_alarm" | "in_queue" | "unsolved";
  locations: { name: string };
  sensor_values: any;
}

const Alerts = () => {
  const { toast } = useToast();
  const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
  const [pastAlerts, setPastAlerts] = useState<Alert[]>([]);
  const [solvedCases, setSolvedCases] = useState<Alert[]>([]);
  const [unsolvedCases, setUnsolvedCases] = useState<Alert[]>([]);
  const [isAuthorityUser, setIsAuthorityUser] = useState(false);

  useEffect(() => {
    checkUserType();
    fetchAlerts();
    
    const channel = supabase
      .channel('alerts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkUserType = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', user.id)
        .single();

      setIsAuthorityUser(profile?.user_type === 'authority');
    } catch (error) {
      console.error('Error checking user type:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from("alerts")
        .select("*, locations(name)")
        .order("timestamp", { ascending: false });

      if (error) throw error;

      const alerts = (data || []) as Alert[];
      setLiveAlerts(alerts.filter(a => a.status === "active" || a.status === "in_queue"));
      setPastAlerts(alerts.filter(a => a.status === "resolved" || a.status === "false_alarm" || a.status === "unsolved"));
      setSolvedCases(alerts.filter(a => a.status === "resolved"));
      setUnsolvedCases(alerts.filter(a => a.status === "unsolved"));
    } catch (error) {
      toast({
        title: "Error fetching alerts",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const updateAlertStatus = async (alertId: string, newStatus: "active" | "resolved" | "false_alarm" | "in_queue" | "unsolved") => {
    try {
      const { data, error } = await supabase.functions.invoke('alert-manager', {
        body: {
          action: 'update',
          alertId,
          status: newStatus
        }
      });

      if (error) throw error;

      toast({
        title: "Alert Updated",
        description: `Alert marked as ${newStatus.replace('_', ' ')}`,
      });
      
      fetchAlerts();
    } catch (error) {
      toast({
        title: "Error updating alert",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "fire": return <Flame className="h-5 w-5 text-destructive" />;
      case "gas_leak": return <Wind className="h-5 w-5 text-status-warning" />;
      case "temperature": return <Thermometer className="h-5 w-5 text-status-alert" />;
      case "motion": return <Users className="h-5 w-5 text-primary" />;
      default: return <AlertTriangle className="h-5 w-5" />;
    }
  };

  const AlertBox = ({ alert }: { alert: Alert }) => (
    <Card className="mb-4 border-l-4 border-l-destructive">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-3">
                {getAlertIcon(alert.alert_type)}
                <div>
                  <h3 className="font-semibold text-lg">{alert.locations?.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Badge variant="destructive">{alert.alert_type.toUpperCase().replace('_', ' ')}</Badge>
                <Badge variant="outline">{alert.severity}</Badge>
                <Badge>{alert.status.replace('_', ' ')}</Badge>
              </div>

              {alert.sensor_values && (
                <div className="text-sm text-muted-foreground mt-2 space-y-1">
                  <p>🌡️ Temperature: {alert.sensor_values.temperature}°C</p>
                  <p>💨 Gas Level: {alert.sensor_values.gas}</p>
                  <p>🔥 Flame: {alert.sensor_values.flame === 'FLAME' ? "🚨 Detected" : "None"}</p>
                  <p>📍 PIR: {alert.sensor_values.pir === '0' ? "Motion Detected" : "No Motion"}</p>
                </div>
              )}
            </div>
          </div>

          {isAuthorityUser && (
            <div className="flex flex-wrap gap-2">
              <Button 
                size="sm" 
                variant={alert.status === "in_queue" ? "default" : "outline"}
                onClick={() => updateAlertStatus(alert.id, "in_queue")}
                className="flex-1 min-w-[120px]"
              >
                In Queue
              </Button>
              <Button 
                size="sm" 
                variant={alert.status === "resolved" ? "default" : "outline"}
                onClick={() => updateAlertStatus(alert.id, "resolved")}
                className="flex-1 min-w-[120px]"
              >
                Solved
              </Button>
              <Button 
                size="sm" 
                variant={alert.status === "unsolved" ? "default" : "outline"}
                onClick={() => updateAlertStatus(alert.id, "unsolved")}
                className="flex-1 min-w-[120px]"
              >
                Unsolved
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Alert Management</h1>
        <p className="text-muted-foreground">Monitor and manage all fire alerts across locations</p>
      </div>

      <Tabs defaultValue="live" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="live">
            Live Alerts
            {liveAlerts.length > 0 && (
              <Badge variant="destructive" className="ml-2">{liveAlerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="past">Past Alerts</TabsTrigger>
          <TabsTrigger value="solved">Solved Cases</TabsTrigger>
          <TabsTrigger value="unsolved">Unsolved Cases</TabsTrigger>
          <TabsTrigger value="casualties">Casualties</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-4">
          {liveAlerts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No active alerts. All systems operational.
              </CardContent>
            </Card>
          ) : (
            liveAlerts.map(alert => <AlertBox key={alert.id} alert={alert} />)
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-4">
          {pastAlerts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No past alerts.
              </CardContent>
            </Card>
          ) : (
            pastAlerts.map(alert => <AlertBox key={alert.id} alert={alert} />)
          )}
        </TabsContent>

        <TabsContent value="solved" className="space-y-4">
          {solvedCases.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No solved cases yet.
              </CardContent>
            </Card>
          ) : (
            solvedCases.map(alert => <AlertBox key={alert.id} alert={alert} />)
          )}
        </TabsContent>

        <TabsContent value="unsolved" className="space-y-4">
          {unsolvedCases.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No unsolved cases.
              </CardContent>
            </Card>
          ) : (
            unsolvedCases.map(alert => <AlertBox key={alert.id} alert={alert} />)
          )}
        </TabsContent>

        <TabsContent value="casualties">
          <Card>
            <CardHeader>
              <CardTitle>Casualties Report</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">No casualties reported.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Alerts;
