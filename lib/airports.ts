// Pakistan airport coordinates
export const PAKISTAN_AIRPORTS: Record<string, { lat: number; lon: number; name: string }> = {
  // Major airports
  OPKC: { lat: 24.9065, lon: 67.1607, name: "Karachi (Jinnah International)" },
  OPLA: { lat: 31.5216, lon: 74.4036, name: "Lahore (Allama Iqbal)" },
  OPRN: { lat: 33.6167, lon: 73.0992, name: "Islamabad (Benazir Bhutto)" },
  OPSD: { lat: 24.8936, lon: 67.1981, name: "Karachi (Jinnah Terminal)" },
  OPGD: { lat: 25.2333, lon: 62.3294, name: "Gwadar" },
  OPGT: { lat: 25.2333, lon: 62.3294, name: "Gwadar" },
  OPMF: { lat: 30.1917, lon: 71.4194, name: "Multan" },
  OPSK: { lat: 27.7222, lon: 68.7917, name: "Sukkur" },
  OPPS: { lat: 33.9939, lon: 71.5144, name: "Peshawar" },
  OPQT: { lat: 30.2511, lon: 66.9378, name: "Quetta" },
  OPSR: { lat: 32.0486, lon: 72.6653, name: "Sargodha" },
  OPSW: { lat: 24.9065, lon: 67.1607, name: "Karachi (Secondary)" },
  OPGW: { lat: 25.2333, lon: 62.3294, name: "Gwadar" },
  OPMG: { lat: 30.1917, lon: 71.4194, name: "Multan" },
  OPSH: { lat: 27.7222, lon: 68.7917, name: "Sukkur" },
  OPPG: { lat: 33.9939, lon: 71.5144, name: "Peshawar" },
  OPRQ: { lat: 30.2511, lon: 66.9378, name: "Quetta" },
  OPSG: { lat: 32.0486, lon: 72.6653, name: "Sargodha" },
  // FIR centers (approximate)
  OPKR: { lat: 24.9065, lon: 67.1607, name: "Karachi FIR" },
  OPLR: { lat: 31.5216, lon: 74.4036, name: "Lahore FIR" },
};

// Common international airports (for routes to/from Pakistan)
export const INTERNATIONAL_AIRPORTS: Record<string, { lat: number; lon: number; name: string }> = {
  // Middle East
  OMDB: { lat: 25.2532, lon: 55.3657, name: "Dubai" },
  OMAA: { lat: 24.4330, lon: 54.6511, name: "Abu Dhabi" },
  OEDF: { lat: 24.9583, lon: 46.6983, name: "Riyadh" },
  OEDR: { lat: 26.2658, lon: 50.1520, name: "Dammam" },
  OJAI: { lat: 31.7225, lon: 35.9933, name: "Amman" },
  OTBH: { lat: 25.2611, lon: 51.5651, name: "Doha" },
  OKBK: { lat: 29.2267, lon: 47.9689, name: "Kuwait" },
  OBBI: { lat: 26.2708, lon: 50.6336, name: "Bahrain" },
  // Asia
  VIDP: { lat: 28.5562, lon: 77.1000, name: "Delhi" },
  VABB: { lat: 19.0887, lon: 72.8679, name: "Mumbai" },
  VOBL: { lat: 12.9499, lon: 77.6682, name: "Bangalore" },
  VTBS: { lat: 13.6811, lon: 100.7473, name: "Bangkok" },
  WSSS: { lat: 1.3644, lon: 103.9915, name: "Singapore" },
  VHHH: { lat: 22.3080, lon: 113.9185, name: "Hong Kong" },
  ZBAA: { lat: 40.0801, lon: 116.5845, name: "Beijing" },
  ZSPD: { lat: 31.1434, lon: 121.8052, name: "Shanghai" },
  // Europe
  EGLL: { lat: 51.4700, lon: -0.4543, name: "London Heathrow" },
  EGKK: { lat: 51.1537, lon: -0.1821, name: "London Gatwick" },
  LFPG: { lat: 49.0097, lon: 2.5479, name: "Paris CDG" },
  EDDF: { lat: 50.0379, lon: 8.5622, name: "Frankfurt" },
  EHAM: { lat: 52.3105, lon: 4.7683, name: "Amsterdam" },
  LEMD: { lat: 40.4839, lon: -3.5680, name: "Madrid" },
  LIRF: { lat: 41.8003, lon: 12.2389, name: "Rome" },
  // North America
  KJFK: { lat: 40.6413, lon: -73.7781, name: "New York JFK" },
  KLAX: { lat: 33.9425, lon: -118.4081, name: "Los Angeles" },
  CYYZ: { lat: 43.6772, lon: -79.6306, name: "Toronto" },
  // Add more as needed
};

// Get airport coordinates (checks both Pakistan and international)
export function getAirportCoordinates(icao: string): { lat: number; lon: number; name: string } | null {
  if (!icao || icao === "N/A") return null;
  const code = icao.toUpperCase();
  return PAKISTAN_AIRPORTS[code] || INTERNATIONAL_AIRPORTS[code] || null;
}

// Extract airport code from callsign (e.g., "OPLA_APP" -> "OPLA")
export function getAirportFromCallsign(callsign: string): string | null {
  const match = callsign.match(/^(OP[A-Z0-9]{2,})_/);
  return match ? match[1] : null;
}

// Get coordinates for a callsign
export function getControllerCoordinates(callsign: string): { lat: number; lon: number; name: string } | null {
  const airport = getAirportFromCallsign(callsign);
  if (!airport) return null;
  return PAKISTAN_AIRPORTS[airport] || null;
}

// Calculate distance between two coordinates (Haversine formula) in kilometers
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate ETA in minutes based on distance and groundspeed
// Includes approach and landing time (typically 10-15 minutes)
export function calculateETA(
  currentLat: number,
  currentLon: number,
  arrivalIcao: string,
  groundspeed: number
): { etaMinutes: number | null; etaTime: string | null; distance: number | null } {
  if (!arrivalIcao || arrivalIcao === "N/A" || groundspeed <= 0) {
    return { etaMinutes: null, etaTime: null, distance: null };
  }

  const arrivalCoords = getAirportCoordinates(arrivalIcao);
  if (!arrivalCoords) {
    return { etaMinutes: null, etaTime: null, distance: null };
  }

  const distance = calculateDistance(
    currentLat,
    currentLon,
    arrivalCoords.lat,
    arrivalCoords.lon
  );

  // Convert groundspeed from knots to km/h (1 knot = 1.852 km/h)
  const speedKmh = groundspeed * 1.852;
  
  // Calculate time in hours, then convert to minutes
  const timeHours = distance / speedKmh;
  let etaMinutes = Math.round(timeHours * 60);

  // Add approach and landing time (10-15 minutes depending on distance)
  // For flights > 50km away, add 15 minutes for approach/landing
  // For flights < 50km, add 10 minutes (already in approach phase)
  const approachTime = distance > 50 ? 15 : 10;
  etaMinutes += approachTime;

  // Calculate ETA time in Zulu (UTC) - this is the landing time
  const now = new Date();
  const etaDate = new Date(now.getTime() + etaMinutes * 60000);
  // Format as Zulu time (UTC) - HH:MMZ format
  const hours = etaDate.getUTCHours().toString().padStart(2, '0');
  const minutes = etaDate.getUTCMinutes().toString().padStart(2, '0');
  const etaTime = `${hours}:${minutes}Z`;

  return { etaMinutes, etaTime, distance: Math.round(distance) };
}
