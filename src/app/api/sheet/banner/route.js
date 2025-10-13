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
      range: "BANNER!A:B", // Columna A: link, B: descr
    });

    const rows = response.data.values || [];
    const [headers, ...rest] = rows;

    // Si no hay banners válidos, devolver fallback
    if (!rest.length) {
      return NextResponse.json({ bannerUrl: "/BANNER.webp" });
    }

    // Último banner cargado
    const lastRow = rest[rest.length - 1];
    const link = lastRow[0] || "/BANNER.webp";

    return NextResponse.json({ bannerUrl: link });
  } catch (error) {
    console.error("Error leyendo Google Sheet:", error);
    // fallback ante error
    return NextResponse.json({ bannerUrl: "/BANNER.webp" }, { status: 200 });
  }
}
