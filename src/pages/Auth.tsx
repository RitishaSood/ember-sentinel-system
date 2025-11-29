import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Flame, MapPin } from "lucide-react";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
});

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [signupData, setSignupData] = useState({ email: "", password: "", fullName: "" });
  const [capturedLocation, setCapturedLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validated = loginSchema.parse(loginData);
      
      const { error } = await supabase.auth.signInWithPassword({
        email: validated.email,
        password: validated.password,
      });

      if (error) throw error;

      toast({
        title: "Login successful",
        description: "Welcome back to Fire Defence System",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Login failed",
          description: error instanceof Error ? error.message : "Invalid credentials",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent, userType: "authority" | "normal") => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validated = signupSchema.parse(signupData);
      
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: validated.email,
        password: validated.password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            full_name: validated.fullName,
            user_type: userType,
          },
        },
      });

      if (signUpError) throw signUpError;

      if (authData.user) {
        const profileData: any = {
          user_id: authData.user.id,
          full_name: validated.fullName,
          user_type: userType,
        };

        // If authority user and location was captured, add fire station coordinates
        if (userType === "authority" && capturedLocation) {
          profileData.fire_station_latitude = capturedLocation.latitude;
          profileData.fire_station_longitude = capturedLocation.longitude;
        }

        await supabase.from("profiles").insert(profileData);
      }

      toast({
        title: "Account created",
        description: `Welcome to FireProtect as ${userType === "authority" ? "Fire Authority" : "Civilian"}`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Signup failed",
          description: error instanceof Error ? error.message : "Could not create account",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const captureFireStationLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser doesn't support location access.",
        variant: "destructive",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCapturedLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        toast({
          title: "Fire station location captured",
          description: "Your fire station location has been recorded.",
        });
      },
      (error) => {
        toast({
          title: "Location access denied",
          description: "Please allow location access to set fire station location.",
          variant: "destructive",
        });
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
      
      <Card className="w-full max-w-md relative shadow-2xl border-border/50">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-primary/10 border-2 border-primary/30">
              <Flame className="h-12 w-12 text-primary animate-pulse" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">Fire Defence System</CardTitle>
          <CardDescription>Real-time fire monitoring and alert management</CardDescription>
        </CardHeader>
        
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="officer@firedefence.com"
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <div className="space-y-4 mt-4">
                <p className="text-sm text-center text-muted-foreground">
                  Choose your account type
                </p>
                
                <Tabs defaultValue="normal">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="normal">Civilian</TabsTrigger>
                    <TabsTrigger value="authority">Fire Authority</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="normal">
                    <form onSubmit={(e) => handleSignup(e, "normal")} className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label htmlFor="signup-name-normal">Full Name</Label>
                        <Input
                          id="signup-name-normal"
                          type="text"
                          placeholder="John Doe"
                          value={signupData.fullName}
                          onChange={(e) => setSignupData({ ...signupData, fullName: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signup-email-normal">Email</Label>
                        <Input
                          id="signup-email-normal"
                          type="email"
                          placeholder="user@example.com"
                          value={signupData.email}
                          onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signup-password-normal">Password</Label>
                        <Input
                          id="signup-password-normal"
                          type="password"
                          value={signupData.password}
                          onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? "Creating account..." : "Create Civilian Account"}
                      </Button>
                    </form>
                  </TabsContent>
                  
                  <TabsContent value="authority">
                    <form onSubmit={(e) => handleSignup(e, "authority")} className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label htmlFor="signup-name-auth">Full Name</Label>
                        <Input
                          id="signup-name-auth"
                          type="text"
                          placeholder="Officer John Doe"
                          value={signupData.fullName}
                          onChange={(e) => setSignupData({ ...signupData, fullName: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signup-email-auth">Official Email</Label>
                        <Input
                          id="signup-email-auth"
                          type="email"
                          placeholder="officer@firestation.gov"
                          value={signupData.email}
                          onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signup-password-auth">Password</Label>
                        <Input
                          id="signup-password-auth"
                          type="password"
                          value={signupData.password}
                          onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fire Station Location</Label>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={captureFireStationLocation}
                        >
                          <MapPin className="h-4 w-4 mr-2" />
                          {capturedLocation 
                            ? `Location Set (${capturedLocation.latitude.toFixed(4)}, ${capturedLocation.longitude.toFixed(4)})` 
                            : "Capture Fire Station Location"}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Optional: Capture your fire station's location for map routing
                        </p>
                      </div>
                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? "Creating account..." : "Create Authority Account"}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
