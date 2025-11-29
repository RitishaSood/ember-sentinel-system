import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MapPin, User, Calendar, FileText, Check, X, Loader2 } from "lucide-react";

interface LocationRequest {
  id: string;
  location_name: string;
  region: string;
  latitude: number;
  longitude: number;
  thingspeak_channel_id: string;
  thingspeak_read_key: string;
  reason: string | null;
  status: string | null;
  created_at: string;
  user_id: string;
  user_email?: string;
}

const PendingLocationRequests = () => {
  const [requests, setRequests] = useState<LocationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const fetchPendingRequests = async () => {
    try {
      const { data, error } = await supabase
        .from("location_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error("Error fetching requests:", error);
      toast({
        title: "Error",
        description: "Failed to fetch pending requests",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (request: LocationRequest) => {
    setProcessingId(request.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create the location
      const { error: locationError } = await supabase
        .from("locations")
        .insert({
          name: request.location_name,
          region: request.region,
          latitude: request.latitude,
          longitude: request.longitude,
          thingspeak_channel_id: request.thingspeak_channel_id,
          thingspeak_read_key: request.thingspeak_read_key,
          status: "normal",
        });

      if (locationError) throw locationError;

      // Update request status
      const { error: updateError } = await supabase
        .from("location_requests")
        .update({
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      if (updateError) throw updateError;

      toast({
        title: "Success",
        description: `Location "${request.location_name}" has been approved and added`,
      });

      fetchPendingRequests();
    } catch (error) {
      console.error("Error approving request:", error);
      toast({
        title: "Error",
        description: "Failed to approve request",
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request: LocationRequest) => {
    setProcessingId(request.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("location_requests")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      if (error) throw error;

      toast({
        title: "Request Rejected",
        description: `Location request for "${request.location_name}" has been rejected`,
      });

      fetchPendingRequests();
    } catch (error) {
      console.error("Error rejecting request:", error);
      toast({
        title: "Error",
        description: "Failed to reject request",
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pending Location Requests</h1>
        <p className="text-muted-foreground mt-1">
          Review and manage location monitoring requests from users
        </p>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">No pending requests</p>
            <p className="text-muted-foreground text-sm">
              All location requests have been processed
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {requests.map((request) => (
            <Card key={request.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{request.location_name}</CardTitle>
                    <CardDescription>{request.region}</CardDescription>
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>
                      {request.latitude.toFixed(6)}, {request.longitude.toFixed(6)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {new Date(request.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                {request.reason && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Reason
                        </p>
                        <p className="text-sm">{request.reason}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  <p>Channel ID: {request.thingspeak_channel_id}</p>
                </div>
              </CardContent>

              <CardFooter className="gap-2">
                <Button
                  className="flex-1"
                  onClick={() => handleApprove(request)}
                  disabled={processingId === request.id}
                >
                  {processingId === request.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Approve
                    </>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => handleReject(request)}
                  disabled={processingId === request.id}
                >
                  {processingId === request.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <X className="h-4 w-4 mr-2" />
                      Reject
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default PendingLocationRequests;
