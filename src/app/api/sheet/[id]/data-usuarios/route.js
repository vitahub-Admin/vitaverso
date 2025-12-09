import { google } from "googleapis";
import { NextResponse } from "next/server"; // ✅ Añadir esto

// Campos que SÍ se pueden exponer al frontend
const CAMPOS_PUBLICOS = {
  "nombre": "nombre",
  "apellido": "apellido",
  "email": "email",
  "red social": "red_social",
  "clabe": "clabe",
  "telefono": "telefono"
};

export async function GET(req, { params }) { // ✅ Cambiar a `{ params }`
  try {
    const { id } = await params;   // ✅ CORRECTO

    if (!id) {
      return NextResponse.json( // ✅ Cambiar a NextResponse.json
        { success: false, message: "Falta ID de usuario" },
        { status: 400 }
      );
    }

    // Auth Google Sheets
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") || "", // ✅ Optional chaining
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // GET sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.AFILIADOS_SHEET_ID,
      range: "Hoja 1",
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ success: false, message: "Sheet vacía" }); // ✅ NextResponse
    }

    // Primera fila = nombres de columnas
    const headers = rows[0];

    // Buscar fila del usuario
    const userRow = rows.find((row) => {
      const colIndex = headers.indexOf("Id Usuario");
      return row[colIndex] === id;
    });

    if (!userRow) {
      return NextResponse.json( // ✅ NextResponse
        { success: false, message: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Convertir la fila a objeto clave/valor
    const entry = {};
    headers.forEach((col, index) => {
      entry[col.trim().toLowerCase()] = userRow[index] || "";
    });

    // Filtrar solo los campos permitidos
    const filtrado = {};
    Object.entries(CAMPOS_PUBLICOS).forEach(([colOriginal, colFrontend]) => {
      filtrado[colFrontend] = entry[colOriginal.toLowerCase()] || "";
    });

    return NextResponse.json({ success: true, data: filtrado }, { status: 200 }); // ✅ NextResponse

  } catch (err) {
    console.error("Error Google Sheets:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 }); // ✅ NextResponse
  }
}

export async function PATCH(req, { params }) { // ✅ Cambiar a `{ params }`
  try {
    const { id } = await params;  // ✅ CORRECTO
    if (!id) {
      return NextResponse.json( // ✅ NextResponse
        { success: false, message: "Falta ID de usuario" },
        { status: 400 }
      );
    }

    const body = await req.json();
    
    // Campos editables permitidos
    const CAMPOS_EDITABLES = {
      "nombre": "nombre",
      "apellido": "apellido",
      "email": "email",
      "red_social": "red social",
      "clabe": "clabe",
      "telefono":"telefono"
    };

    // Tomar solo los campos permitidos
    const updates = {};
    for (const key of Object.keys(CAMPOS_EDITABLES)) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json( // ✅ NextResponse
        { success: false, message: "No hay campos válidos para actualizar" },
        { status: 400 }
      );
    }

    // Autenticación Google
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") || "", // ✅ Optional chaining
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Leer la hoja
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.AFILIADOS_SHEET_ID,
      range: "Hoja 1",
    });

    const rows = response.data.values || [];
    const headers = rows[0];

    // Columna de ID Usuario
    const idIndex = headers.indexOf("Id Usuario");
    if (idIndex === -1) throw new Error("No existe la columna 'Id Usuario'");

    // Encontrar la fila del usuario
    const rowIndex = rows.findIndex((r) => r[idIndex] === id);
    if (rowIndex === -1) {
      return NextResponse.json( // ✅ NextResponse
        { success: false, message: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Preparar actualizaciones
    const updateRequests = [];

    Object.entries(updates).forEach(([campoFrontend, valor]) => {
      const columnaSheet = CAMPOS_EDITABLES[campoFrontend];

      const colIndex = headers.findIndex(
        (h) => h.trim().toLowerCase() === columnaSheet.toLowerCase()
      );

      if (colIndex !== -1) {
        updateRequests.push({
          range: `Hoja 1!${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`,
          values: [[valor]]
        });
      }
    });

    // Ejecutar batch update
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: process.env.AFILIADOS_SHEET_ID,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: updateRequests,
      },
    });

    return NextResponse.json( // ✅ NextResponse
      { success: true, message: "Datos actualizados", updates },
      { status: 200 }
    );

  } catch (err) {
    console.error("ERROR PATCH:", err);
    return NextResponse.json( // ✅ NextResponse
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}