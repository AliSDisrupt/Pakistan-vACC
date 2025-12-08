import { NextResponse } from "next/server";
import axios from "axios";

// VATSIM Division API - Pakistan is part of VATMENA region, division code "PAK"
const DIVISION_API = "https://api.vatsim.net/api/subdivisions/";

interface DivisionMember {
  id: number;
  name_first: string;
  name_last: string;
  rating: number;
}

interface SubdivisionResponse {
  id: string;
  name: string;
  code: string;
  members?: DivisionMember[];
}

// Rating names from VATSIM
function getRatingName(rating: number): string {
  const ratings: Record<number, string> = {
    0: "Suspended",
    1: "Observer (OBS)",
    2: "Student 1 (S1)",
    3: "Student 2 (S2)",
    4: "Student 3 (S3)",
    5: "Controller 1 (C1)",
    6: "Controller 2 (C2)",
    7: "Controller 3 (C3)",
    8: "Instructor 1 (I1)",
    9: "Instructor 2 (I2)",
    10: "Instructor 3 (I3)",
    11: "Supervisor (SUP)",
    12: "Administrator (ADM)",
  };
  return ratings[rating] || `Rating ${rating}`;
}

export async function GET() {
  try {
    // Try to get Pakistan subdivision data
    const { data } = await axios.get<SubdivisionResponse[]>(DIVISION_API, {
      timeout: 15000,
    });

    // Find Pakistan subdivision (code might be PAK, PK, or similar)
    const pakistan = data.find(
      (d) =>
        d.code?.toUpperCase() === "PAK" ||
        d.code?.toUpperCase() === "PK" ||
        d.name?.toLowerCase().includes("pakistan")
    );

    if (!pakistan) {
      // Return basic info if Pakistan not found in subdivisions
      return NextResponse.json({
        found: false,
        message: "Pakistan subdivision data not publicly available",
        subdivisions: data.map((d) => ({ id: d.id, name: d.name, code: d.code })),
      });
    }

    return NextResponse.json({
      found: true,
      subdivision: {
        id: pakistan.id,
        name: pakistan.name,
        code: pakistan.code,
      },
      members: pakistan.members?.map((m) => ({
        cid: m.id,
        name: `${m.name_first} ${m.name_last}`,
        rating: m.rating,
        ratingName: getRatingName(m.rating),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch division data:", error);
    return NextResponse.json(
      { error: "Failed to fetch division data", found: false },
      { status: 500 }
    );
  }
}


