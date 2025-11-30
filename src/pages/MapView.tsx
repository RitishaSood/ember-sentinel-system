import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GoogleMap, LoadScript, Marker, DirectionsRenderer } from "@react-google-maps/api";

interface Location {
  id: string;
  name: string;
  region: string;
  status: "normal" | "warning" | "alert";
  latitude: number;
  longitude: number;
}

interface FireStation {
  id: string;
  fire_station: string;
  fire_station_latitude: number;
  fire_station_longitude: number;
  authority_name: string;
}

const GOOGLE_MAPS_KEY = "AIzaSyA688wCVDAYjow3olR5ZqDyJVxe3eTEXYY";

const MapView = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [fireStations, setFireStations] = useState<FireStation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [nearestStation, setNearestStation] = useState<FireStation | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>({ lat: 28.6139, lng: 77.2090 });
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const mapContainerStyle = {
    width: '100%',
    height: '100%',
  };

  useEffect(() => {
    fetchData();
    getUserLocation();
  }, []);

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserLocation(userPos);
          setMapCenter(userPos);
        },
        (error) => {
          console.error("Error getting user location:", error);
          toast({
            title: "Location access denied",
            description: "Please enable location access to see route from your current position",
            variant: "destructive",
          });
        }
      );
    }
  };

  useEffect(() => {
    const locationId = searchParams.get("location");
    if (locationId && locations.length > 0) {
      const location = locations.find((loc) => loc.id === locationId);
      if (location) {
        setSelectedLocation(location);
        calculateNearestStation(location);
      }
    }
  }, [searchParams, locations, fireStations]);

  const fetchData = async () => {
    try {
      // Fetch fire detection locations
      const { data: locData, error: locError } = await supabase
        .from("locations")
        .select("*")
        .order("name");

      if (locError) throw locError;
      setLocations((locData || []) as Location[]);

      // Fetch fire stations from authority profiles
      const { data: stationData, error: stationError } = await supabase
        .from("profiles")
        .select("id, fire_station, fire_station_latitude, fire_station_longitude, authority_name")
        .eq("user_type", "authority")
        .not("fire_station_latitude", "is", null)
        .not("fire_station_longitude", "is", null);

      if (stationError) throw stationError;
      setFireStations((stationData || []) as FireStation[]);
    } catch (error) {
      toast({
        title: "Error fetching data",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateNearestStation = async (location: Location) => {
    setDirectionsResponse(null);
    
    // Calculate distance from user's current location to the fire alert location
    if (userLocation) {
      await drawRoute(userLocation, { lat: location.latitude, lng: location.longitude });
      return;
    }

    // Fallback: calculate nearest fire station
    if (fireStations.length === 0) {
      setNearestStation(null);
      setDistance(null);
      return;
    }

    let minDistance = Infinity;
    let nearest: FireStation | null = null;

    fireStations.forEach((station) => {
      const dist = calculateDistance(
        location.latitude,
        location.longitude,
        station.fire_station_latitude,
        station.fire_station_longitude
      );

      if (dist < minDistance) {
        minDistance = dist;
        nearest = station;
      }
    });

    setNearestStation(nearest);
    
    // Draw route from nearest fire station to alert location
    if (nearest) {
      await drawRoute(
        { lat: nearest.fire_station_latitude, lng: nearest.fire_station_longitude },
        { lat: location.latitude, lng: location.longitude }
      );
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const drawRoute = async (start: google.maps.LatLngLiteral, end: google.maps.LatLngLiteral) => {
    if (!window.google) return;

    const directionsService = new google.maps.DirectionsService();

    try {
      const result = await directionsService.route({
        origin: start,
        destination: end,
        travelMode: google.maps.TravelMode.DRIVING,
      });

      setDirectionsResponse(result);

      // Extract distance from the result
      if (result.routes[0]?.legs[0]?.distance) {
        const distanceKm = result.routes[0].legs[0].distance.value / 1000;
        setDistance(distanceKm);
      }
    } catch (error) {
      console.error("Error calculating route:", error);
      toast({
        title: "Routing error",
        description: "Unable to calculate route. Showing approximate distance.",
        variant: "destructive",
      });
      
      // Fallback to straight-line distance
      const dist = calculateDistance(start.lat, start.lng, end.lat, end.lng);
      setDistance(dist);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "alert":
        return "bg-status-alert";
      case "warning":
        return "bg-status-warning";
      default:
        return "bg-status-normal";
    }
  };

  const getMarkerIcon = (status: string) => {
    if (!window.google) return undefined;
    
    const color = status === "alert" ? "#ef4444" : status === "warning" ? "#f59e0b" : "#22c55e";
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
      scale: 12,
    };
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
              <h1 className="text-2xl font-bold">Global Map View</h1>
              <p className="text-sm text-muted-foreground">Monitor all locations in real-time</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="h-[600px]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Interactive Map
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-80px)]">
                {isLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-muted-foreground">Loading map...</p>
                  </div>
                ) : (
                  <LoadScript googleMapsApiKey={GOOGLE_MAPS_KEY}>
                    <GoogleMap
                      mapContainerStyle={mapContainerStyle}
                      center={mapCenter}
                      zoom={11}
                      onLoad={setMap}
                      options={{
                        zoomControl: true,
                        streetViewControl: false,
                        mapTypeControl: true,
                        fullscreenControl: true,
                      }}
                    >
                      {/* User location marker */}
                      {userLocation && (
                        <Marker
                          position={userLocation}
                          icon={{
                            url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
                          }}
                          title="Your Location"
                        />
                      )}

                      {/* Fire detection location markers */}
                      {locations.map((location) => (
                        <Marker
                          key={location.id}
                          position={{ lat: location.latitude, lng: location.longitude }}
                          icon={getMarkerIcon(location.status)}
                          title={location.name}
                          onClick={() => {
                            setSelectedLocation(location);
                            calculateNearestStation(location);
                            setMapCenter({ lat: location.latitude, lng: location.longitude });
                            map?.panTo({ lat: location.latitude, lng: location.longitude });
                            map?.setZoom(14);
                          }}
                          animation={location.status === "alert" && window.google ? google.maps.Animation.BOUNCE : undefined}
                        />
                      ))}

                      {/* Fire station markers */}
                      {fireStations.map((station) => (
                        <Marker
                          key={station.id}
                          position={{
                            lat: station.fire_station_latitude,
                            lng: station.fire_station_longitude,
                          }}
                          icon={{
                            url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
                          }}
                          title={`${station.fire_station} - ${station.authority_name}`}
                        />
                      ))}

                      {/* Direction route */}
                      {directionsResponse && (
                        <DirectionsRenderer
                          directions={directionsResponse}
                          options={{
                            polylineOptions: {
                              strokeColor: "#ef4444",
                              strokeWeight: 5,
                              strokeOpacity: 0.8,
                            },
                            suppressMarkers: true,
                          }}
                        />
                      )}
                    </GoogleMap>
                  </LoadScript>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Locations ({locations.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[280px] overflow-y-auto">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : locations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No locations found</p>
                ) : (
                  locations.map((location) => (
                    <div
                      key={location.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-all hover:scale-[1.02] ${
                        selectedLocation?.id === location.id
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                      onClick={() => {
                        setSelectedLocation(location);
                        calculateNearestStation(location);
                        setMapCenter({ lat: location.latitude, lng: location.longitude });
                        map?.panTo({ lat: location.latitude, lng: location.longitude });
                        map?.setZoom(14);
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getStatusColor(location.status)}`} />
                          <span className="font-medium text-sm">{location.name}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {location.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{location.region}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {selectedLocation && (
              <Card>
                <CardHeader>
                  <CardTitle>Route Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <span className="text-sm text-muted-foreground">Alert Location</span>
                    <p className="font-medium">{selectedLocation.name}</p>
                    <Badge 
                      variant={selectedLocation.status === "alert" ? "destructive" : "secondary"}
                      className="mt-1"
                    >
                      {selectedLocation.status}
                    </Badge>
                  </div>

                  {userLocation && distance !== null ? (
                    <>
                      <div className="border-t pt-3">
                        <span className="text-sm text-muted-foreground">From Your Location</span>
                        <p className="font-medium flex items-center gap-2">
                          📍 Current Position
                        </p>
                      </div>

                      <div>
                        <span className="text-sm text-muted-foreground">Distance to Alert</span>
                        <p className="font-medium text-lg text-destructive">{distance.toFixed(2)} km</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Estimated travel time: {Math.ceil(distance * 2)} mins
                        </p>
                      </div>

                      <Button 
                        className="w-full" 
                        onClick={() => {
                          const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${selectedLocation.latitude},${selectedLocation.longitude}`;
                          window.open(url, "_blank");
                        }}
                      >
                        <Navigation className="h-4 w-4 mr-2" />
                        Navigate with Google Maps
                      </Button>
                    </>
                  ) : !userLocation && distance !== null && nearestStation ? (
                    <>
                      <div className="border-t pt-3">
                        <span className="text-sm text-muted-foreground">Nearest Fire Station</span>
                        <p className="font-medium flex items-center gap-2">
                          🚒 {nearestStation.fire_station}
                        </p>
                      </div>

                      <div>
                        <span className="text-sm text-muted-foreground">Distance</span>
                        <p className="font-medium text-lg">{distance.toFixed(2)} km</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Estimated travel time: {Math.ceil(distance * 2)} mins
                        </p>
                      </div>

                      <Button 
                        className="w-full" 
                        onClick={() => {
                          const url = `https://www.google.com/maps/dir/?api=1&origin=${nearestStation.fire_station_latitude},${nearestStation.fire_station_longitude}&destination=${selectedLocation.latitude},${selectedLocation.longitude}`;
                          window.open(url, "_blank");
                        }}
                      >
                        <Navigation className="h-4 w-4 mr-2" />
                        Navigate with Google Maps
                      </Button>
                    </>
                  ) : (
                    <div className="border-t pt-3">
                      <p className="text-sm text-muted-foreground">
                        Enable location access to see route from your current position
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default MapView;
