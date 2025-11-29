import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Clock, CheckCircle, XCircle, Navigation } from "lucide-react";

interface LocationRequest {
  id: string;
  location_name: string;
  region: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  created_at: string;
  reviewed_at: string;
}

const RequestLocation = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<LocationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [formData, setFormData] = useState({
    location_name: "",
    region: "",
    latitude: "",
    longitude: "",
    thingspeak_channel_id: "",
    thingspeak_read_key: "",
    reason: "",
  });

  useEffect(() => {
    checkAuth();
    fetchRequests();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
    }
  };

  const fetchRequests = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("location_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data as LocationRequest[]);
    } catch (error) {
      toast({
        title: "Error fetching requests",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const { error } = await supabase.from("location_requests").insert([
        {
          user_id: user.id,
          location_name: formData.location_name,
          region: formData.region,
          latitude: parseFloat(formData.latitude),
          longitude: parseFloat(formData.longitude),
          thingspeak_channel_id: formData.thingspeak_channel_id,
          thingspeak_read_key: formData.thingspeak_read_key,
          reason: formData.reason,
          status: "pending",
        },
      ]);

      if (error) throw error;

      toast({
        title: "Request Submitted",
        description: "Your location addition request has been submitted for review.",
      });

      setFormData({
        location_name: "",
        region: "",
        latitude: "",
        longitude: "",
        thingspeak_channel_id: "",
        thingspeak_read_key: "",
        reason: "",
      });

      fetchRequests();
    } catch (error) {
      toast({
        title: "Error submitting request",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "approved":
        return <CheckCircle className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "pending":
        return "outline";
      case "approved":
        return "default";
      case "rejected":
        return "destructive";
      default:
        return "outline";
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser doesn't support location access.",
        variant: "destructive",
      });
      return;
    }

    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData({
          ...formData,
          latitude: position.coords.latitude.toString(),
          longitude: position.coords.longitude.toString(),
        });
        toast({
          title: "Location captured",
          description: "Your current location has been set.",
        });
        setGettingLocation(false);
      },
      (error) => {
        toast({
          title: "Location access denied",
          description: "Please allow location access or enter coordinates manually.",
          variant: "destructive",
        });
        setGettingLocation(false);
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Request New Location</h1>
        <p className="text-muted-foreground">Submit a request to add a new fire monitoring location</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Submit New Request</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="location_name">Location Name</Label>
                <Input
                  id="location_name"
                  value={formData.location_name}
                  onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                  placeholder="Community Center Alpha"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input
                  id="region"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  placeholder="West District"
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Location Coordinates</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={getCurrentLocation}
                    disabled={gettingLocation}
                  >
                    <Navigation className="h-4 w-4 mr-2" />
                    {gettingLocation ? "Getting Location..." : "Use Current Location"}
                  </Button>
                </div>
                
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="latitude">Latitude</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="any"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      placeholder="28.6139"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="longitude">Longitude</Label>
                    <Input
                      id="longitude"
                      type="number"
                      step="any"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      placeholder="77.2090"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="channel_id">ThingSpeak Channel ID</Label>
                <Input
                  id="channel_id"
                  value={formData.thingspeak_channel_id}
                  onChange={(e) => setFormData({ ...formData, thingspeak_channel_id: e.target.value })}
                  placeholder="3184451"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="read_key">ThingSpeak Read API Key</Label>
                <Input
                  id="read_key"
                  value={formData.thingspeak_read_key}
                  onChange={(e) => setFormData({ ...formData, thingspeak_read_key: e.target.value })}
                  placeholder="S4P1LIPZ9I886B76"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason for Request</Label>
                <Textarea
                  id="reason"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Explain why this location should be monitored..."
                  rows={3}
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                <MapPin className="h-4 w-4 mr-2" />
                {submitting ? "Submitting..." : "Submit Request"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Your Requests</h2>
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Loading requests...
              </CardContent>
            </Card>
          ) : requests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No requests submitted yet.
              </CardContent>
            </Card>
          ) : (
            requests.map((request) => (
              <Card key={request.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{request.location_name}</CardTitle>
                    <Badge variant={getStatusVariant(request.status)} className="flex items-center gap-1">
                      {getStatusIcon(request.status)}
                      {request.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{request.region}</p>
                </CardHeader>
                <CardContent>
                  {request.reason && (
                    <div className="mb-2">
                      <p className="text-sm font-medium">Reason:</p>
                      <p className="text-sm text-muted-foreground">{request.reason}</p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Submitted: {new Date(request.created_at).toLocaleDateString()}
                  </p>
                  {request.reviewed_at && (
                    <p className="text-xs text-muted-foreground">
                      Reviewed: {new Date(request.reviewed_at).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default RequestLocation;
