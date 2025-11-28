import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface LocationCardProps {
  id: string;
  name: string;
  region: string;
  status: "normal" | "warning" | "alert";
  latitude: number;
  longitude: number;
  onCheckSensors?: (locationId: string) => void;
  isChecking?: boolean;
}

const statusConfig = {
  normal: {
    color: "bg-status-normal",
    label: "Normal",
    variant: "secondary" as const,
  },
  warning: {
    color: "bg-status-warning",
    label: "Warning",
    variant: "default" as const,
  },
  alert: {
    color: "bg-status-alert glow-alert",
    label: "Alert",
    variant: "destructive" as const,
  },
};

export const LocationCard = ({ id, name, region, status, latitude, longitude, onCheckSensors, isChecking }: LocationCardProps) => {
  const navigate = useNavigate();
  const config = statusConfig[status];

  return (
    <Card 
      className={`transition-all hover:scale-[1.02] cursor-pointer ${status === "alert" ? "border-primary" : ""}`}
      onClick={() => navigate(`/location/${id}`)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.color}`}>
              <MapPin className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{name}</CardTitle>
              <p className="text-sm text-muted-foreground">{region}</p>
            </div>
          </div>
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              <p>Lat: {latitude.toFixed(6)}</p>
              <p>Lng: {longitude.toFixed(6)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/map?location=${id}`);
              }}
              className="flex-1"
            >
              View on Map
            </Button>
            {onCheckSensors && (
              <Button 
                size="sm" 
                variant="default"
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckSensors(id);
                }}
                disabled={isChecking}
                className="flex-1"
              >
                {isChecking ? "Checking..." : "Check Sensors"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
