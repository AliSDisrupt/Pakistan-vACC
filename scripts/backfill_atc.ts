import "dotenv/config";
import axios from "axios";
import { prisma } from "../lib/db";

const API = axios.create({
  baseURL: "https://api.vatsim.net",
  headers: { "X-API-Key": String(process.env.VATSIM_API_KEY || "") }
});

const isPkAtc = (cs: string) => /^OP[A-Z0-9]{2,}_(DEL|GND|TWR|APP|DEP|CTR|FSS|ATIS)$/i.test(cs);

const inferFIR = (cs: string): "OPKR" | "OPLR" | null =>
  cs.startsWith("OPKR_") ? "OPKR" : cs.startsWith("OPLR_") ? "OPLR" : null;

interface ATCHistoryItem {
  connection_id?: {
    callsign?: string;
    start?: string;
    end?: string;
    vatsim_id?: number;
  };
}

interface ATCHistoryResponse {
  items?: ATCHistoryItem[];
  count?: number;
}

async function main() {
  if (!process.env.VATSIM_API_KEY) {
    console.error("VATSIM_API_KEY missing; cannot backfill");
    process.exit(1);
  }
  const SINCE = new Date("2020-01-01T00:00:00Z").getTime();
  let offset = 0;
  const limit = 100;
  let totalImported = 0;

  console.log("Starting ATC backfill from 2020-01-01...");

  for (;;) {
    const { data } = await API.get<ATCHistoryResponse>("/v2/atc/history", { params: { limit, offset } });
    const items: ATCHistoryItem[] = data.items || [];
    if (!items.length) break;

    const rows = items
      .filter((x) => x?.connection_id?.callsign && isPkAtc(x.connection_id.callsign))
      .filter((x) => new Date(x.connection_id!.start!).getTime() >= SINCE)
      .map((x) => {
        const start = new Date(x.connection_id!.start!);
        const end = new Date(x.connection_id!.end!);
        return {
          cid: Number(x.connection_id!.vatsim_id) || null,
          callsign: x.connection_id!.callsign!,
          fir: inferFIR(x.connection_id!.callsign!),
          start,
          end,
          minutes: Math.max(1, Math.round((+end - +start) / 60000))
        };
      });

    for (const r of rows) {
      await prisma.controllerSession.create({ data: r });
      totalImported++;
    }

    console.log(`Processed offset ${offset}, imported ${rows.length} PK sessions`);
    offset += limit;
    if (offset >= (data.count ?? offset)) break;
  }

  console.log(`Backfill complete. Total imported: ${totalImported}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


