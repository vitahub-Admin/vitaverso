// scripts/check_drive_access.mjs — diagnóstico one-off (solo lectura)
import { google } from 'googleapis'

const FOLDER_ID   = '1cny_6buu3YoDxDEoF7V5r8-sc1HT0_cY'
const TEMPLATE_ID = '1GSVCrUG51cXPWYCOBnxShA2eKF57MUpz_NkUh73Ty2I'

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
  ],
})

const drive  = google.drive({ version: 'v3', auth })
const sheets = google.sheets({ version: 'v4', auth })

// 1. ¿Vemos la carpeta?
try {
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    pageSize: 50,
  })
  console.log('✓ Acceso a carpeta Facturacion OK. Contenido:')
  for (const f of res.data.files) console.log(`  - ${f.name}`)
} catch (e) {
  console.log('✗ Carpeta:', e.message)
}

// 2. ¿Vemos la plantilla y sus tabs?
try {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: TEMPLATE_ID,
    fields: 'sheets(properties(title,sheetId))',
  })
  console.log('\n✓ Plantilla accesible. Tabs:')
  for (const s of meta.data.sheets) console.log(`  - "${s.properties.title}" (id ${s.properties.sheetId})`)

  const hdr = await sheets.spreadsheets.values.get({
    spreadsheetId: TEMPLATE_ID,
    range: 'Comodin!A1:Z1',
  })
  console.log('\nEncabezados del tab "Comodin":')
  console.log(JSON.stringify(hdr.data.values?.[0] || []))
} catch (e) {
  console.log('✗ Plantilla:', e.message)
}
