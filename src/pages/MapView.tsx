import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

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

const MAPTILER_KEY = "2k9xSo6D3dn6XRfFnFxJ";

const MapView = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [fireStations, setFireStations] = useState<FireStation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [nearestStation, setNearestStation] = useState<FireStation | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    fetchData();
    getUserLocation();
  }, []);

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.longitude, position.coords.latitude]);
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

  useEffect(() => {
    if (!mapContainer.current || locations.length === 0) return;

    // Set MapTiler access token
    mapboxgl.accessToken = MAPTILER_KEY;

    // Initialize map with MapTiler
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
      center: [77.2090, 28.6139], // Default to Delhi
      zoom: 11,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Add markers for fire detection locations
    locations.forEach((location) => {
      const color = 
        location.status === "alert" ? "#ef4444" :
        location.status === "warning" ? "#f59e0b" :
        "#22c55e";

      const el = document.createElement("div");
      el.className = "marker";
      el.style.backgroundColor = color;
      el.style.width = "24px";
      el.style.height = "24px";
      el.style.borderRadius = "50%";
      el.style.border = "3px solid white";
      el.style.cursor = "pointer";
      el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
      
      // Add blinking animation for alert locations
      if (location.status === "alert") {
        el.style.animation = "blink-alert 1s ease-in-out infinite";
      }

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([location.longitude, location.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
              <div style="padding: 8px;">
                <h3 style="font-weight: bold; margin-bottom: 4px;">${location.name}</h3>
                <p style="font-size: 12px; color: #666;">${location.region}</p>
                <p style="font-size: 12px; margin-top: 4px;">Status: <strong>${location.status}</strong></p>
              </div>
            `)
        )
        .addTo(map.current!);

      el.addEventListener("click", () => {
        setSelectedLocation(location);
        calculateNearestStation(location);
      });
    });

    // Add markers for fire stations
    fireStations.forEach((station) => {
      const el = document.createElement("div");
      el.innerHTML = "🚒";
      el.style.fontSize = "28px";
      el.style.cursor = "pointer";

      new mapboxgl.Marker({ element: el })
        .setLngLat([station.fire_station_longitude, station.fire_station_latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
              <div style="padding: 8px;">
                <h3 style="font-weight: bold; margin-bottom: 4px;">🚒 ${station.fire_station}</h3>
                <p style="font-size: 12px; color: #666;">${station.authority_name}</p>
              </div>
            `)
        )
        .addTo(map.current!);
    });

    // Add marker for user's current location
    if (userLocation) {
      const userEl = document.createElement("div");
      userEl.innerHTML = "📍";
      userEl.style.fontSize = "32px";
      userEl.style.cursor = "pointer";

      new mapboxgl.Marker({ element: userEl })
        .setLngLat(userLocation)
        .setPopup(
          new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
              <div style="padding: 8px;">
                <h3 style="font-weight: bold; margin-bottom: 4px;">Your Location</h3>
                <p style="font-size: 12px; color: #666;">Current Position</p>
              </div>
            `)
        )
        .addTo(map.current!);
    }

    // Fit map to show all locations
    if (locations.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      locations.forEach((loc) => bounds.extend([loc.longitude, loc.latitude]));
      fireStations.forEach((station) => bounds.extend([station.fire_station_longitude, station.fire_station_latitude]));
      if (userLocation) bounds.extend(userLocation);
      map.current.fitBounds(bounds, { padding: 50 });
    }

    return () => {
      map.current?.remove();
    };
  }, [locations, fireStations, userLocation]);

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
    // Calculate distance from user's current location to the fire alert location
    if (userLocation) {
      const dist = calculateDistance(
        userLocation[1], // latitude
        userLocation[0], // longitude
        location.latitude,
        location.longitude
      );
      setDistance(dist);

      // Draw route from user location to fire alert location
      if (map.current) {
        drawRoute(userLocation, [location.longitude, location.latitude]);
      }
    } else {
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
      setDistance(minDistance);

      // Draw route on map
      if (nearest && map.current) {
        drawRoute(
          [location.longitude, location.latitude],
          [nearest.fire_station_longitude, nearest.fire_station_latitude]
        );
      }
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

  const drawRoute = (start: [number, number], end: [number, number]) => {
    if (!map.current) return;

    // Remove existing route layers if present
    if (map.current.getLayer("route-outline")) {
      map.current.removeLayer("route-outline");
    }
    if (map.current.getLayer("route")) {
      map.current.removeLayer("route");
    }
    if (map.current.getSource("route")) {
      map.current.removeSource("route");
    }

    // Fetch route from MapTiler routing API (uses shortest path algorithms on road networks)
    const routeUrl = `https://api.maptiler.com/routing/driving/${start[0]},${start[1]};${end[0]},${end[1]}.json?key=${MAPTILER_KEY}`;

    fetch(routeUrl)
      .then((response) => response.json())
      .then((data) => {
        if (!data.routes || data.routes.length === 0) {
          drawStraightLine(start, end);
          return;
        }

        const route = data.routes[0];
        const coordinates = route.geometry.coordinates;

        // Add route using actual road geometry
        map.current!.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {
              distance: route.distance,
              duration: route.duration,
            },
            geometry: {
              type: "LineString",
              coordinates: coordinates,
            },
          },
        });

        // Add white outline
        map.current!.addLayer({
          id: "route-outline",
          type: "line",
          source: "route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#ffffff",
            "line-width": 8,
            "line-opacity": 0.6,
          },
        });

        // Add main route line
        map.current!.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#ef4444",
            "line-width": 5,
            "line-opacity": 0.9,
          },
        });

        // Fit map to route
        const bounds = new mapboxgl.LngLatBounds();
        coordinates.forEach((coord: [number, number]) => bounds.extend(coord));
        map.current!.fitBounds(bounds, { padding: 100 });

        // Update with actual road distance
        const distanceKm = route.distance / 1000;
        setDistance(distanceKm);
      })
      .catch((error) => {
        console.error("Routing error:", error);
        toast({
          title: "Routing unavailable",
          description: "Showing straight-line distance",
          variant: "default",
        });
        drawStraightLine(start, end);
      });
  };

  const drawStraightLine = (start: [number, number], end: [number, number]) => {
    if (!map.current) return;

    map.current.addSource("route", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [start, end],
        },
      },
    });

    map.current.addLayer({
      id: "route",
      type: "line",
      source: "route",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#ef4444",
        "line-width": 5,
        "line-dasharray": [2, 2],
      },
    });

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend(start);
    bounds.extend(end);
    map.current.fitBounds(bounds, { padding: 100 });
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
                  <div ref={mapContainer} className="w-full h-full rounded-lg" />
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
                        if (map.current) {
                          map.current.flyTo({
                            center: [location.longitude, location.latitude],
                            zoom: 14,
                          });
                        }
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
                          const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation[1]},${userLocation[0]}&destination=${selectedLocation.latitude},${selectedLocation.longitude}`;
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