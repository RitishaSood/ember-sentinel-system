import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Alert Manager Edge Function
 * 
 * This function manages alert creation and evaluation based on sensor thresholds.
 * It calls the ThingSpeak service (placeholder) to fetch sensor data.
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, locationId, alertId, status } = await req.json();

    console.log('[Alert Manager] Request:', { action, locationId, alertId, status });

    if (action === 'evaluate') {
      // Fetch location data
      const { data: location, error: locationError } = await supabaseClient
        .from('locations')
        .select('*')
        .eq('id', locationId)
        .single();

      if (locationError) throw locationError;

      // Fetch latest sensor data from ThingSpeak
      const { data: sensorData, error: sensorError } = await supabaseClient.functions.invoke(
        'thingspeak-service',
        {
          body: { action: 'latest', location }
        }
      );

      console.log('[Alert Manager] Sensor data received:', sensorData);

      if (sensorError || !sensorData?.success || !sensorData?.data) {
        console.log('[Alert Manager] No sensor data available for location:', location.name);
        return new Response(
          JSON.stringify({ success: true, message: 'No sensor data available' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const sensors = sensorData.data;
      
      // Define thresholds for alerts
      const thresholds = {
        temperature: { critical: 35 },
        gas: { critical: 400 },
        flame: { detected: 'FLAME' },
        pir: { detected: '0' } // 0 = motion detected, 1 = no motion
      };

      let alertType = null;
      let severity = 'critical';
      
      // Check for fire (flame detected when value is "FLAME")
      if (sensors.flame === 'FLAME') {
        alertType = 'fire';
        severity = 'critical';
      }
      // Check for gas leak
      else if (sensors.gas > thresholds.gas.critical) {
        alertType = 'gas_leak';
        severity = 'critical';
      }
      // Check for high temperature
      else if (sensors.temperature > thresholds.temperature.critical) {
        alertType = 'temperature';
        severity = 'critical';
      }

      // Create or update alert if threshold exceeded
      if (alertType) {
        // Check if there's an alert for this location within the last hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: existingAlert } = await supabaseClient
          .from('alerts')
          .select('*')
          .eq('location_id', locationId)
          .gte('timestamp', oneHourAgo)
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();

        if (existingAlert) {
          // Update existing alert
          const { data: updatedAlert, error: updateError } = await supabaseClient
            .from('alerts')
            .update({
              alert_type: alertType,
              severity,
              sensor_values: sensors,
              timestamp: new Date().toISOString(),
            })
            .eq('id', existingAlert.id)
            .select()
            .single();

          if (updateError) {
            console.error('[Alert Manager] Error updating alert:', updateError);
            throw updateError;
          }

          console.log('[Alert Manager] Alert updated:', updatedAlert);
          return new Response(
            JSON.stringify({ success: true, alert: updatedAlert, updated: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          // Create new alert
          const { data: newAlert, error: alertError } = await supabaseClient
            .from('alerts')
            .insert({
              location_id: locationId,
              alert_type: alertType,
              severity,
              status: 'active',
              sensor_values: sensors,
              timestamp: new Date().toISOString(),
            })
            .select()
            .single();

          if (alertError) {
            console.error('[Alert Manager] Error creating alert:', alertError);
            throw alertError;
          }

          console.log('[Alert Manager] Alert created:', newAlert);
          return new Response(
            JSON.stringify({ success: true, alert: newAlert, created: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        console.log('[Alert Manager] Sensor values within normal range');
        return new Response(
          JSON.stringify({ success: true, message: 'All sensors within normal range', sensors }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (action === 'update') {
      // Update alert status
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) throw new Error('No authorization header');

      const { data: { user } } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
      if (!user) throw new Error('Unauthorized');

      const { error: updateError } = await supabaseClient
        .from('alerts')
        .update({
          status,
          resolved_at: status !== 'active' ? new Date().toISOString() : null,
          resolved_by: status !== 'active' ? user.id : null,
        })
        .eq('id', alertId);

      if (updateError) throw updateError;

      console.log('[Alert Manager] Alert updated:', { alertId, status });

      return new Response(
        JSON.stringify({ success: true, message: 'Alert updated successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');
  } catch (error) {
    console.error('[Alert Manager] Error:', error);
    let message = 'Unknown error';
    if (error instanceof Error) {
      message = error.message;
    } else if (error && typeof error === 'object' && 'message' in error) {
      message = String(error.message);
    } else if (typeof error === 'string') {
      message = error;
    }
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
