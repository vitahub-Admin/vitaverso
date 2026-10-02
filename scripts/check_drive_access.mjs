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
//
// Preguntar por el contenido NO sirve como prueba de acceso: cuando la cuenta
// de servicio no ve la carpeta, Drive devuelve una lista vacía en vez de un
// error, y el chequeo decía "OK" con la carpeta sin compartir. El que no miente
// es files.get sobre el ID.
try {
  const { data: carpeta } = await drive.files.get({
    fileId: FOLDER_ID,
    fields: 'id, name, mimeType, trashed, driveId, owners(emailAddress)',
    supportsAllDrives: true,
  })
  console.log(`✓ Carpeta visible: "${carpeta.name}" · papelera: ${carpeta.trashed}` +
    (carpeta.driveId ? ` · en unidad compartida ${carpeta.driveId}` : ` · dueño: ${carpeta.owners?.[0]?.emailAddress || '—'}`))

  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    pageSize: 50,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  console.log(`  contenido: ${res.data.files.length} elementos`)
  for (const f of res.data.files) console.log(`  - ${f.name}`)
} catch (e) {
  console.log('✗ Carpeta:', e.message)
  console.log('  → compartirla como Editor con:', process.env.GOOGLE_CLIENT_EMAIL)
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
