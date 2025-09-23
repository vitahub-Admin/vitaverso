import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: "1vYYmoZEEd1-Q5yvGhdRV-YsRNaDL5NsqmJ5amt0-Yrw", 
      range: "Hoja 1!A:D", // A: titulo, B: imagen, C: contenido
    });

    const rows = response.data.values || [];

    // quitar cabecera
    const [headers, ...rest] = rows;

    // mapear a objetos con keys legibles
    const noticias = rest.map((row, i) => ({
      id: i + 1,
      titulo: row[0] || "",
      imagen: row[1] || "",
      contenido: row[2] || "",
      fecha: row[3] || "",
    }));

    return NextResponse.json({ noticias });
  } catch (error) {
    console.error("Error leyendo Google Sheet:", error);
    return NextResponse.json({ error: "Error leyendo datos" }, { status: 500 });
  }
}
