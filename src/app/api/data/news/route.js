import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "data", "news.json");

// Helpers
function readFile() {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeFile(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// GET — lista completa
export async function GET() {
  const data = readFile();
  return NextResponse.json({ news: data.news || [] });

}

// POST — agregar noticia
export async function POST(req) {
  const body = await req.json();
  const data = readFile();

  data.news.push({
    titulo: body.titulo || "",
    imagen: body.imagen || "",
    contenido: body.contenido || "",
    fecha: body.fecha || "",
  });

  writeFile(data);

  return NextResponse.json({ ok: true });
}

// PUT — guardar reordenamiento o edición
export async function PUT(req) {
  const body = await req.json();

  writeFile({ news: body.news || [] });

  return NextResponse.json({ ok: true });
}

// DELETE — borrar por índice
export async function DELETE(req) {
  const { index } = await req.json();

  const data = readFile();
  data.news.splice(index, 1);

  writeFile(data);

  return NextResponse.json({ ok: true });
}
