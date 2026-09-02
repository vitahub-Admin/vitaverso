// scripts/check_drive_location.mjs — diagnóstico one-off (solo lectura)
import { google } from 'googleapis'

const FOLDER_ID = '1cny_6buu3YoDxDEoF7V5r8-sc1HT0_cY'

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
})
const drive = google.drive({ version: 'v3', auth })

const meta = await drive.files.get({
  fileId: FOLDER_ID,
  fields: 'id, name, driveId, parents, owners(emailAddress), capabilities(canAddChildren)',
  supportsAllDrives: true,
})
console.log('Carpeta "Facturacion":')
console.log('  driveId (unidad compartida):', meta.data.driveId || 'NINGUNO — sigue en Mi unidad')
console.log('  owners:', (meta.data.owners || []).map(o => o.emailAddress).join(', ') || '(n/a en unidad compartida)')
console.log('  canAddChildren:', meta.data.capabilities?.canAddChildren)

// Listar unidades compartidas visibles para el service account
const drives = await drive.drives.list({ pageSize: 20 })
console.log('\nUnidades compartidas visibles para el service account:')
if (!drives.data.drives?.length) console.log('  (ninguna)')
for (const d of drives.data.drives || []) console.log(`  - "${d.name}" (id ${d.id})`)
