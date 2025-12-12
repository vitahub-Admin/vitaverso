import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const FILE = path.join(process.cwd(), "data", "banners.json");
const DEFAULT = { url: "/BANNER.webp", description: "Default banner" };

export async function GET() {
  try {
    let json;

    try {
      const raw = await readFile(FILE, "utf8");
      json = JSON.parse(raw);
    } catch {
      // archivo no existe o está roto → crear con default
      json = { banners: [DEFAULT] };
      await writeFile(FILE, JSON.stringify(json, null, 2), "utf8");
    }

    // Si está vacío → restaurar default
    if (!json.banners || json.banners.length === 0) {
      json.banners = [DEFAULT];
      await writeFile(FILE, JSON.stringify(json, null, 2), "utf8");
    }

    const last = json.banners[json.banners.length - 1];
    return NextResponse.json(last);
  } catch (e) {
    // fallback absoluto
    return NextResponse.json(DEFAULT);
  }
}

export async function POST(req) {
  const body = await req.json();

  if (!body.url) {
    return NextResponse.json({ error: "url requerida" }, { status: 400 });
  }

  const raw = await readFile(FILE, "utf8");
  const json = JSON.parse(raw);

  json.banners.push({
    url: body.url,
    description: body.description || ""
  });

  await writeFile(FILE, JSON.stringify(json, null, 2), "utf8");

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const raw = await readFile(FILE, "utf8");
  const json = JSON.parse(raw);

  if (json.banners.length > 0) json.banners.pop();

  // nunca permitir vacío → restaurar default
  if (json.banners.length === 0) {
    json.banners = [DEFAULT];
  }

  await writeFile(FILE, JSON.stringify(json, null, 2), "utf8");

  return NextResponse.json({ ok: true });
}

export async function PUT(req) {
  const body = await req.json();

  if (!Array.isArray(body.banners)) {
    return NextResponse.json({ error: "banners debe ser un array" }, { status: 400 });
  }

  // Si viene vacío → usamos default
  const newList = body.banners.length > 0 ? body.banners : [DEFAULT];

  await writeFile(
    FILE,
    JSON.stringify({ banners: newList }, null, 2),
    "utf8"
  );

  return NextResponse.json({ ok: true });
}
