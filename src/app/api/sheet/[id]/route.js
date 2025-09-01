import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(req) {
  try {
    // Leer customerId desde cookie
    const customerId = req.cookies.get("customerId")?.value;

    if (!customerId) {
      return new Response(
        JSON.stringify({ success: false, message: "No hay customerId en cookies" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Inicializar auth con service account
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
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
      return new Response(
        JSON.stringify({ success: true, data: match }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, message: "No se encontró coincidencia" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
