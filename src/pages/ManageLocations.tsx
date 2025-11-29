import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Navigation } from "lucide-react";

interface Location {
  id: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  thingspeak_channel_id: string;
  thingspeak_read_key: string;
}

const ManageLocations = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    region: "",
    latitude: "",
    longitude: "",
    thingspeak_channel_id: "",
    thingspeak_read_key: "",
  });

  useEffect(() => {
    checkAuthority();
    fetchLocations();
  }, []);

  const checkAuthority = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_type")
      .eq("user_id", user.id)
      .single();

    if (profile?.user_type !== "authority") {
      toast({
        title: "Access Denied",
        description: "Only fire authorities can manage locations.",
        variant: "destructive",
      });
      navigate("/dashboard");
    }
  };

  const fetchLocations = async () => {
    try {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .order("name");

      if (error) throw error;
      setLocations(data || []);
    } catch (error) {
      toast({
        title: "Error fetching locations",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { error } = await supabase.from("locations").insert([
        {
          name: formData.name,
          region: formData.region,
          latitude: parseFloat(formData.latitude),
          longitude: parseFloat(formData.longitude),
          thingspeak_channel_id: formData.thingspeak_channel_id,
          thingspeak_read_key: formData.thingspeak_read_key,
          status: "normal",
        },
      ]);

      if (error) throw error;

      toast({
        title: "Location Added",
        description: "New monitoring location has been added successfully.",
      });

      setIsDialogOpen(false);
      setFormData({
        name: "",
        region: "",
        latitude: "",
        longitude: "",
        thingspeak_channel_id: "",
        thingspeak_read_key: "",
      });
      fetchLocations();
    } catch (error) {
      toast({
        title: "Error adding location",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this location?")) return;

    try {
      const { error } = await supabase.from("locations").delete().eq("id", id);

      if (error) throw error;

      toast({
        title: "Location Deleted",
        description: "Location has been removed successfully.",
      });

      fetchLocations();
    } catch (error) {
      toast({
        title: "Error deleting location",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
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
          description: "Current location has been set.",
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Manage Locations</h1>
          <p className="text-muted-foreground">Add and manage fire monitoring locations</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Location</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Location Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Fire Station Delta"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="region">Region</Label>
                  <Input
                    id="region"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    placeholder="South District"
                    required
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <Label>Location Coordinates</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={getCurrentLocation}
                      disabled={gettingLocation}
                    >
                      <Navigation className="h-4 w-4 mr-2" />
                      {gettingLocation ? "Getting..." : "Use Current Location"}
                    </Button>
                  </div>
                </div>

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
              </div>

              <Button type="submit" className="w-full">Add Location</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading locations...
          </CardContent>
        </Card>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No locations added yet. Click "Add Location" to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {locations.map((location) => (
            <Card key={location.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{location.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{location.region}</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleDelete(location.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Coordinates:</span>
                    <span>{location.latitude}, {location.longitude}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Channel ID:</span>
                    <span className="font-mono">{location.thingspeak_channel_id}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ManageLocations;
