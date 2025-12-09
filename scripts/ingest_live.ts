import "dotenv/config";
import axios from "axios";
import { prisma } from "../lib/db";
import { loadPakistanFIRs, insidePakistanFIR } from "../lib/fir";

const FEED = "https://data.vatsim.net/v3/vatsim-data.json";

const isPkController = (cs: string) =>
  /^OP[A-Z0-9]{2,}_(DEL|GND|TWR|APP|DEP|CTR|FSS|ATIS)$/i.test(cs);

const inferFirFromCallsign = (cs: string): "OPKR" | "OPLR" | undefined =>
  cs.startsWith("OPKR_") ? "OPKR" : cs.startsWith("OPLR_") ? "OPLR" : undefined;

interface VatsimController {
  callsign: string;
  cid?: number;
}

interface VatsimPilot {
  callsign: string;
  cid?: number;
  latitude: number;
  longitude: number;
  flight_plan?: {
    departure?: string;
    arrival?: string;
  };
}

interface VatsimFeed {
  controllers: VatsimController[];
  pilots: VatsimPilot[];
}

async function runOnce() {
  await loadPakistanFIRs();
  const { data } = await axios.get<VatsimFeed>(FEED, { timeout: 20000 });
  const now = new Date();

  // Controllers
  for (const c of data.controllers) {
    const cs = String(c.callsign);
    if (!isPkController(cs)) continue;
    const fir = inferFirFromCallsign(cs) ?? null;

    const existing = await prisma.openSession.findFirst({ where: { role: "ATC", callsign: cs } });
    if (!existing) {
      await prisma.openSession.create({
        data: {
          role: "ATC",
          callsign: cs,
          cid: c.cid ?? null,
          fir,
          startedAt: now,
          lastSeenAt: now
        }
      });
    } else {
      await prisma.openSession.update({ where: { id: existing.id }, data: { lastSeenAt: now, fir } });
    }
  }

  // Pilots (Pakistan if inside OPKR/OPLR or dep/arr starts with OP)
  for (const p of data.pilots) {
    const cs = String(p.callsign);
    const dep = p.flight_plan?.departure?.toUpperCase?.();
    const arr = p.flight_plan?.arrival?.toUpperCase?.();
    const hasOP = (x?: string) => x?.startsWith?.("OP");
    const pos = insidePakistanFIR(p.latitude, p.longitude);
    const inPk = pos.inside || hasOP(dep) || hasOP(arr);
    if (!inPk) continue;

    const existing = await prisma.openSession.findFirst({ where: { role: "PILOT", callsign: cs } });
    const payload = {
      role: "PILOT" as const,
      callsign: cs,
      cid: p.cid ?? null,
      dep: dep || null,
      arr: arr || null,
      inPakistan: true,
      fir: (pos.inside ? pos.fir : undefined) || null
    };

    if (!existing) {
      await prisma.openSession.create({ data: { ...payload, startedAt: now, lastSeenAt: now } });
    } else {
      await prisma.openSession.update({ where: { id: existing.id }, data: { ...payload, lastSeenAt: now } });
    }
  }

  // Close stale (>3 minutes)
  const cutoff = new Date(Date.now() - 3 * 60 * 1000);
  const stale = await prisma.openSession.findMany({ where: { lastSeenAt: { lt: cutoff } } });

  for (const s of stale) {
    const end = s.lastSeenAt;
    const minutes = Math.max(1, Math.round((+end - +s.startedAt) / 60000));

    if (s.role === "ATC") {
      await prisma.controllerSession.create({
        data: { cid: s.cid, callsign: s.callsign, fir: s.fir, start: s.startedAt, end, minutes }
      });
    } else {
      await prisma.pilotSession.create({
        data: {
          cid: s.cid,
          callsign: s.callsign,
          dep: s.dep,
          arr: s.arr,
          fir: s.fir,
          inPakistan: s.inPakistan,
          start: s.startedAt,
          end,
          minutes
        }
      });
    }
    await prisma.openSession.delete({ where: { id: s.id } });
  }

  console.log(`[${now.toISOString()}] Ingest complete`);
}

(async () => {
  await runOnce();
})();




