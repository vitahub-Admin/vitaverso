import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(req) {
  try {
    // Leer customerId desde cookie
    const customerId = req.cookies.get("customerId")?.value;

    if (!customerId) {
      return NextResponse.json(
        { success: false, message: "No hay customerId en cookies" },
        { status: 400 }
      );
    }

    // Inicializar auth con service account
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") || "", // ✅ Optional chaining
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Leer datos de la hoja
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "Hoja 1!A:C",
    });

    const rows = response.data.values || [];
    const match = rows.find((row) => row[2] === customerId);

    if (match) {
      return NextResponse.json(
        { success: true, data: match },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { success: false, message: "No se encontró coincidencia" },
        { status: 200 }
      );
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}