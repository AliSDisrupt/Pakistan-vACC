import axios from "axios";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { Feature, Polygon, MultiPolygon } from "geojson";

let loaded = false;
let pkPolys: Feature<Polygon | MultiPolygon>[] = [];

export async function loadPakistanFIRs() {
  if (loaded) return;
  const { data } = await axios.get("https://api.vatsim.net/api/map_data/");
  const geoUrl = data?.fir_boundaries_geojson_url;
  if (!geoUrl) throw new Error("No fir_boundaries_geojson_url");
  const gj = (await axios.get(geoUrl)).data;
  pkPolys = gj.features.filter((f: Feature<Polygon | MultiPolygon>) => {
    const props = f.properties as Record<string, unknown> | null;
    const id = props?.id || props?.ICAO || props?.fir;
    return id === "OPKR" || id === "OPLR";
  });
  loaded = true;
}

export function insidePakistanFIR(lat: number, lon: number): { inside: boolean; fir?: "OPKR" | "OPLR" } {
  if (!pkPolys.length) return { inside: false };
  const p = point([lon, lat]);
  for (const f of pkPolys) {
    if (booleanPointInPolygon(p, f)) {
      const props = f.properties as Record<string, unknown> | null;
      const id = props?.id || props?.ICAO || props?.fir;
      return { inside: true, fir: id as "OPKR" | "OPLR" };
    }
  }
  return { inside: false };
}