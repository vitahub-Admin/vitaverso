import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const FILE = path.join(process.cwd(), "data", "banners.json");

export async function GET() {
  try {
    const raw = await readFile(FILE, "utf8");
    const json = JSON.parse(raw);

    return NextResponse.json(json.banners || []);
  } catch {
    return NextResponse.json([]);
  }
}
