import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * ThingSpeak Service - Placeholder Functions
 * 
 * TODO: Implement actual ThingSpeak API integration
 * 
 * This service provides placeholder functions for fetching sensor data from ThingSpeak.
 * The actual implementation should be added by the user with their ThingSpeak credentials.
 */

/**
 * Fetch the latest sensor values from ThingSpeak
 * 
 * @param location - Location object containing thingspeak_channel_id and thingspeak_read_key
 * @returns Object containing sensor values or null
 */
async function fetchLatestSensorValues(location: any) {
  try {
    const url = `https://api.thingspeak.com/channels/${location.thingspeak_channel_id}/feeds/last.json?api_key=${location.thingspeak_read_key}`;
    
    console.log('[ThingSpeak Service] Fetching latest data for location:', location.name);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('[ThingSpeak Service] API error:', response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    
    console.log('[ThingSpeak Service] Received data:', data);
    
    return {
      temperature: parseFloat(data.field1),
      humidity: parseFloat(data.field2),
      flame: data.field3,
      gas: parseFloat(data.field4),
      pir: data.field5,
      timestamp: data.created_at,
    };
  } catch (error) {
    console.error('[ThingSpeak Service] Error fetching latest values:', error);
    return null;
  }
}

/**
 * Fetch historical sensor data from ThingSpeak
 * 
 * @param location - Location object containing thingspeak_channel_id and thingspeak_read_key
 * @param results - Number of results to fetch (default: 100)
 * @returns Array of historical sensor readings or empty array
 */
async function fetchSensorHistory(location: any, results: number = 100) {
  try {
    const url = `https://api.thingspeak.com/channels/${location.thingspeak_channel_id}/feeds.json?api_key=${location.thingspeak_read_key}&results=${results}`;
    
    console.log('[ThingSpeak Service] Fetching history for location:', location.name, 'results:', results);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('[ThingSpeak Service] API error:', response.status, response.statusText);
      return [];
    }
    
    const data = await response.json();
    
    console.log('[ThingSpeak Service] Received', data.feeds?.length || 0, 'historical records');
    
    if (!data.feeds || !Array.isArray(data.feeds)) {
      return [];
    }
    
    return data.feeds.map((feed: any) => ({
      timestamp: feed.created_at,
      temperature: parseFloat(feed.field1),
      humidity: parseFloat(feed.field2),
      flame: feed.field3,
      gas: parseFloat(feed.field4),
      pir: feed.field5,
    }));
  } catch (error) {
    console.error('[ThingSpeak Service] Error fetching history:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, location, results } = await req.json();

    console.log('[ThingSpeak Service] Request received:', { action, locationName: location?.name });

    let data;
    
    if (action === 'latest') {
      data = await fetchLatestSensorValues(location);
    } else if (action === 'history') {
      data = await fetchSensorHistory(location, results);
    } else {
      throw new Error('Invalid action. Use "latest" or "history"');
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[ThingSpeak Service] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
