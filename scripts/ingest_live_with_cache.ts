import "dotenv/config";
import axios from "axios";
import { loadPakistanFIRs, insidePakistanFIR } from "../lib/fir";
import { updateSessions } from "../lib/cache";

const FEED = "https://data.vatsim.net/v3/vatsim-data.json";

const isPkController = (cs: string) =>
  /^OP[A-Z0-9]{2,}_(DEL|GND|TWR|APP|DEP|CTR|FSS|ATIS)$/i.test(cs);

const inferFirFromCallsign = (cs: string): "OPKR" | "OPLR" | undefined =>
  cs.startsWith("OPKR_") ? "OPKR" : cs.startsWith("OPLR_") ? "OPLR" : undefined;

interface VatsimController {
  callsign: string;
  cid?: number;
  name?: string;
  frequency?: string;
  facility?: number;
}

interface VatsimPilot {
  callsign: string;
  cid?: number;
  name?: string;
  latitude: number;
  longitude: number;
  flight_plan?: {
    departure?: string;
    arrival?: string;
    aircraft_short?: string;
  };
}

interface VatsimFeed {
  controllers: VatsimController[];
  pilots: VatsimPilot[];
}

async function runOnce() {
  try {
    await loadPakistanFIRs();
    const { data } = await axios.get<VatsimFeed>(FEED, { timeout: 20000 });

    // Get Pakistan controllers
    const pkControllers = data.controllers
      .filter((c) => isPkController(String(c.callsign)))
      .map((c) => ({
        cid: c.cid || 0,
        name: c.name || "Unknown",
        callsign: String(c.callsign),
        frequency: c.frequency || "N/A",
        facility: c.facility ? ["OBS", "FSS", "DEL", "GND", "TWR", "APP", "CTR"][c.facility] || "UNK" : "UNK",
      }));

    // Get Pakistan pilots
    const pkPilots = data.pilots
      .filter((p) => {
        const dep = p.flight_plan?.departure?.toUpperCase() || "";
        const arr = p.flight_plan?.arrival?.toUpperCase() || "";
        const hasOP = dep.startsWith("OP") || arr.startsWith("OP");
        const pos = insidePakistanFIR(p.latitude, p.longitude);
        return pos.inside || hasOP;
      })
      .map((p) => ({
        cid: p.cid || 0,
        name: p.name || "Unknown",
        callsign: String(p.callsign),
        departure: p.flight_plan?.departure?.toUpperCase() || "N/A",
        arrival: p.flight_plan?.arrival?.toUpperCase() || "N/A",
        aircraft: p.flight_plan?.aircraft_short || "N/A",
      }));

    // Update sessions (this will save to cache AND database)
    const { added, removed } = await updateSessions(pkControllers, pkPilots);

    if (added.length > 0 || removed.length > 0) {
      console.log(`[${new Date().toISOString()}] Sessions updated:`);
      if (added.length > 0) console.log(`  Added: ${added.join(", ")}`);
      if (removed.length > 0) console.log(`  Removed: ${removed.length} sessions`);
    } else {
      console.log(`[${new Date().toISOString()}] No changes (${pkControllers.length} controllers, ${pkPilots.length} pilots online)`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error);
    process.exit(1);
  }
}

// Run continuously every 15 seconds
(async () => {
  console.log("Starting live data collector with database persistence...");
  console.log("DATABASE_URL:", process.env.DATABASE_URL ? "✅ Configured" : "⚠️ Not configured (cache only)");
  
  while (true) {
    await runOnce();
    await new Promise((resolve) => setTimeout(resolve, 15000)); // 15 seconds
  }
})();



