import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { NotificationCard } from "@/components/NotificationCard";
import { LiveSensorReadings } from "@/components/LiveSensorReadings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LogOut, Map, MapPin, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Alert {
  id: string;
  location_id: string;
  alert_type: "fire" | "gas_leak" | "temperature" | "motion";
  timestamp: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "active" | "resolved" | "false_alarm" | "in_queue" | "unsolved";
  locations: {
    name: string;
  };
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
  const [pastCases, setPastCases] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorityUser, setIsAuthorityUser] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchAlerts();
    
    const interval = setInterval(fetchAlerts, 10000);
    
    const channel = supabase
      .channel('alerts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    // Check user type
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', session.user.id)
        .single();

      setIsAuthorityUser(profile?.user_type === 'authority');
    } catch (error) {
      console.error('Error checking user type:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      const { data: live, error: liveError } = await supabase
        .from("alerts")
        .select("*, locations(name)")
        .eq("status", "active")
        .order("timestamp", { ascending: false });

      if (liveError) throw liveError;

      const { data: past, error: pastError } = await supabase
        .from("alerts")
        .select("*, locations(name)")
        .in("status", ["resolved", "false_alarm"])
        .order("timestamp", { ascending: false })
        .limit(20);

      if (pastError) throw pastError;

      setLiveAlerts((live || []) as Alert[]);
      setPastCases((past || []) as Alert[]);
    } catch (error) {
      toast({
        title: "Error fetching alerts",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleStatusChange = async (alertId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("alerts")
        .update({ status: newStatus })
        .eq("id", alertId);

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Fire Defence System</h1>
              <p className="text-sm text-muted-foreground">Real-time Monitoring Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/locations")}>
              <MapPin className="h-4 w-4 mr-2" />
              Locations
            </Button>
            <Button variant="outline" onClick={() => navigate("/map")}>
              <Map className="h-4 w-4 mr-2" />
              Map View
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <LiveSensorReadings />
        
        <Tabs defaultValue="live" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="live">
              Live Alerts
              {liveAlerts.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {liveAlerts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="past">Past Cases</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="space-y-4">
            {isLoading ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Loading alerts...
                </CardContent>
              </Card>
            ) : liveAlerts.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No active alerts. All systems operational.
                </CardContent>
              </Card>
            ) : (
              liveAlerts.map((alert) => (
                <NotificationCard
                  key={alert.id}
                  id={alert.id}
                  locationType={alert.locations?.name || "Unknown Location"}
                  alertType={alert.alert_type}
                  timestamp={alert.timestamp}
                  severity={alert.severity}
                  status={alert.status}
                  onStatusChange={handleStatusChange}
                  isAuthorityUser={isAuthorityUser}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="past">
            <Card>
              <CardHeader>
                <CardTitle>Past Cases History</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Alert Type</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pastCases.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell>
                          <Badge variant="outline">{alert.alert_type}</Badge>
                        </TableCell>
                        <TableCell>{alert.locations?.name || "Unknown"}</TableCell>
                        <TableCell>
                          {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{alert.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => navigate(`/alert/${alert.id}`)}
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Total Alerts This Month</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{liveAlerts.length + pastCases.length}</div>
                  <p className="text-sm text-muted-foreground mt-2">Demo analytics data</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-primary">{liveAlerts.length}</div>
                  <p className="text-sm text-muted-foreground mt-2">Requires attention</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Resolved Cases</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-status-normal">{pastCases.length}</div>
                  <p className="text-sm text-muted-foreground mt-2">Successfully handled</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;
