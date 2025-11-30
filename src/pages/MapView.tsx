import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import "leaflet-routing-machine";

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

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Custom marker icons
const createCustomIcon = (color: string, size: number = 25) => {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background-color: ${color};
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const alertIcon = createCustomIcon("#ef4444", 30); // Red for alerts
const warningIcon = createCustomIcon("#f59e0b", 25); // Yellow for warnings
const normalIcon = createCustomIcon("#22c55e", 20); // Green for normal
const userIcon = createCustomIcon("#3b82f6", 25); // Blue for user location
const fireStationIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Routing control component
const RoutingControl: React.FC<{
  start: L.LatLng | null;
  end: L.LatLng | null;
  onRouteFound: (distance: number) => void;
}> = ({ start, end, onRouteFound }) => {
  const map = useMap();
  const routingControlRef = useRef<L.Routing.Control | null>(null);

  useEffect(() => {
    if (!map || !start || !end) return;

    // Remove existing routing control
    if (routingControlRef.current) {
      map.removeControl(routingControlRef.current);
    }

    // Create new routing control
    const control = L.Routing.control({
      waypoints: [start, end],
      routeWhileDragging: false,
      addWaypoints: false,
      show: false,
      lineOptions: {
        styles: [{ color: "#ef4444", weight: 5, opacity: 0.8 }],
        extendToWaypoints: true,
        missingRouteTolerance: 0,
      },
      router: L.Routing.osrmv1({
        serviceUrl: "https://router.project-osrm.org/route/v1",
      }),
    }).addTo(map);

    // Hide the default instructions panel
    const container = control.getContainer();
    if (container) {
      container.style.display = "none";
    }

    // Listen for route found event
    control.on("routesfound", (e: any) => {
      const route = e.routes[0];
      if (route && route.summary) {
        const distanceKm = route.summary.totalDistance / 1000;
        onRouteFound(distanceKm);
      }
    });

    routingControlRef.current = control;

    return () => {
      if (routingControlRef.current && map) {
        map.removeControl(routingControlRef.current);
      }
    };
  }, [map, start, end, onRouteFound]);

  return null;
};

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
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([28.6139, 77.209]);
  const [routeStart, setRouteStart] = useState<L.LatLng | null>(null);
  const [routeEnd, setRouteEnd] = useState<L.LatLng | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    fetchData();
    getUserLocation();
  }, []);

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userPos: [number, number] = [
            position.coords.latitude,
            position.coords.longitude,
          ];
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

  const calculateNearestStation = (location: Location) => {
    setRouteStart(null);
    setRouteEnd(null);
    setDistance(null);

    // Calculate distance from user's current location to the fire alert location
    if (userLocation) {
      setRouteStart(L.latLng(userLocation[0], userLocation[1]));
      setRouteEnd(L.latLng(location.latitude, location.longitude));
      return;
    }

    // Fallback: calculate nearest fire station
    if (fireStations.length === 0) {
      setNearestStation(null);
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
      setRouteStart(L.latLng(nearest.fire_station_latitude, nearest.fire_station_longitude));
      setRouteEnd(L.latLng(location.latitude, location.longitude));
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
    switch (status) {
      case "alert":
        return alertIcon;
      case "warning":
        return warningIcon;
      default:
        return normalIcon;
    }
  };

  const handleLocationClick = (location: Location) => {
    setSelectedLocation(location);
    calculateNearestStation(location);
    setMapCenter([location.latitude, location.longitude]);
    if (mapRef.current) {
      mapRef.current.setView([location.latitude, location.longitude], 14);
    }
  };

  const handleRouteFound = (distanceKm: number) => {
    setDistance(distanceKm);
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
                  <MapContainer
                    center={mapCenter}
                    zoom={11}
                    className="h-full w-full rounded-lg"
                    ref={mapRef}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* User location marker */}
                    {userLocation && (
                      <Marker position={userLocation} icon={userIcon}>
                        <Popup>Your Location</Popup>
                      </Marker>
                    )}

                    {/* Fire detection location markers */}
                    {locations.map((location) => (
                      <Marker
                        key={location.id}
                        position={[location.latitude, location.longitude]}
                        icon={getMarkerIcon(location.status)}
                        eventHandlers={{
                          click: () => handleLocationClick(location),
                        }}
                      >
                        <Popup>
                          <div className="text-sm">
                            <p className="font-semibold">{location.name}</p>
                            <p className="text-muted-foreground">{location.region}</p>
                            <Badge variant="outline" className="mt-1">
                              {location.status}
                            </Badge>
                          </div>
                        </Popup>
                      </Marker>
                    ))}

                    {/* Fire station markers */}
                    {fireStations.map((station) => (
                      <Marker
                        key={station.id}
                        position={[station.fire_station_latitude, station.fire_station_longitude]}
                        icon={fireStationIcon}
                      >
                        <Popup>
                          <div className="text-sm">
                            <p className="font-semibold">🚒 {station.fire_station || "Fire Station"}</p>
                            <p className="text-muted-foreground">{station.authority_name}</p>
                          </div>
                        </Popup>
                      </Marker>
                    ))}

                    {/* Routing control */}
                    {routeStart && routeEnd && (
                      <RoutingControl start={routeStart} end={routeEnd} onRouteFound={handleRouteFound} />
                    )}
                  </MapContainer>
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
                      onClick={() => handleLocationClick(location)}
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
                          const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation[0]},${userLocation[1]}&destination=${selectedLocation.latitude},${selectedLocation.longitude}`;
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
