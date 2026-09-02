// scripts/check_sheet_size.mjs — diagnóstico one-off (solo lectura)
import { google } from 'googleapis'

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})
const sheets = google.sheets({ version: 'v4', auth })
const meta = await sheets.spreadsheets.get({
  spreadsheetId: process.env.SPREADSHEET_ID,
  fields: 'sheets(properties(title,gridProperties(rowCount,columnCount)))',
})
let total = 0
for (const s of meta.data.sheets) {
  const g = s.properties.gridProperties
  total += g.rowCount * g.columnCount
  console.log(`${s.properties.title}: ${g.rowCount} filas x ${g.columnCount} cols = ${(g.rowCount * g.columnCount).toLocaleString()} celdas`)
}
console.log('TOTAL celdas:', total.toLocaleString())
