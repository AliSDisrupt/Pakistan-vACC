import { NextResponse } from "next/server";
import axios from "axios";

// Fetch public statistics from VATSIM about Pakistan activity
// This aggregates data from available public sources

interface VatsimController {
  callsign: string;
  cid: number;
  name: string;
  frequency: string;
  facility: number;
  logon_time: string;
}

interface VatsimPilot {
  callsign: string;
  cid: number;
  name: string;
  flight_plan: {
    departure: string;
    arrival: string;
    aircraft_short: string;
  } | null;
  logon_time: string;
  latitude: number;
  longitude: number;
  altitude: number;
  groundspeed: number;
}

interface VatsimFeed {
  general: {
    update_timestamp: string;
  };
  controllers: VatsimController[];
  pilots: VatsimPilot[];
  atis: VatsimController[];
}

const isPkController = (cs: string) =>
  /^OP[A-Z0-9]{2,}_(DEL|GND|TWR|APP|DEP|CTR|FSS|ATIS)$/i.test(cs);

export async function GET() {
  try {
    // Fetch current live data
    const { data } = await axios.get<VatsimFeed>(
      "https://data.vatsim.net/v3/vatsim-data.json",
      { timeout: 15000 }
    );

    // Get all Pakistan-related activity
    const allControllers = [...data.controllers, ...data.atis];
    const pkControllers = allControllers.filter((c) => isPkController(c.callsign));
    // Exclude ATIS from calculations
    const pkControllersNonAtis = pkControllers.filter((c) => !c.callsign.toUpperCase().endsWith("_ATIS"));

    const pkPilots = data.pilots.filter((p) => {
      const dep = p.flight_plan?.departure?.toUpperCase() || "";
      const arr = p.flight_plan?.arrival?.toUpperCase() || "";
      return dep.startsWith("OP") || arr.startsWith("OP");
    });

    // Calculate current session times (exclude ATIS)
    const now = new Date();
    let totalControllerMinutes = 0;
    let totalPilotMinutes = 0;

    for (const c of pkControllersNonAtis) {
      const logon = new Date(c.logon_time);
      totalControllerMinutes += Math.round((now.getTime() - logon.getTime()) / 60000);
    }

    for (const p of pkPilots) {
      const logon = new Date(p.logon_time);
      totalPilotMinutes += Math.round((now.getTime() - logon.getTime()) / 60000);
    }

    // Build response with available public data
    return NextResponse.json({
      timestamp: data.general.update_timestamp,
      live: {
        controllers: {
          online: pkControllersNonAtis.length,
          currentSessionMinutes: totalControllerMinutes,
          currentSessionHours: (totalControllerMinutes / 60).toFixed(1),
          positions: pkControllersNonAtis.map((c) => ({
            callsign: c.callsign,
            controller: c.name,
            cid: c.cid,
            frequency: c.frequency,
            logonTime: c.logon_time,
          })),
        },
        pilots: {
          online: pkPilots.length,
          currentSessionMinutes: totalPilotMinutes,
          currentSessionHours: (totalPilotMinutes / 60).toFixed(1),
          flights: pkPilots.map((p) => ({
            callsign: p.callsign,
            pilot: p.name,
            cid: p.cid,
            departure: p.flight_plan?.departure || "N/A",
            arrival: p.flight_plan?.arrival || "N/A",
            aircraft: p.flight_plan?.aircraft_short || "N/A",
            altitude: p.altitude,
            groundspeed: p.groundspeed,
            logonTime: p.logon_time,
          })),
        },
      },
      subdivision: {
        code: "PAK",
        name: "Pakistan",
        parentDivision: "WA (West Asia)",
        region: "EMEA",
      },
      note: "Historical data and member rosters require VATSIM API key. Live data refreshes every ~15 seconds.",
    });
  } catch (error) {
    console.error("Stats fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch VATSIM data" },
      { status: 500 }
    );
  }
}


