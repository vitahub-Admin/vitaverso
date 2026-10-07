// scripts/sync_product_catalog.js
// Sincroniza el catálogo de productos desde Shopify → Supabase (product_catalog), a mano.
// La lógica vive en src/lib/syncCatalogo.js y es la MISMA que usa el proceso programado
// (api/crons/sync-catalog), así que lo que pruebes acá es lo que corre solo.
//
// Uso:
//   node scripts/sync_product_catalog.js --simulacro        → dice qué cambiaría, NO escribe
//   node scripts/sync_product_catalog.js                    → sincroniza todo y escribe
//   node scripts/sync_product_catalog.js --horas=48         → solo productos modificados en las últimas 48 h
//   (las opciones se pueden combinar: --horas=48 --simulacro)

import 'dotenv/config'
import { sincronizarCatalogo } from '../src/lib/syncCatalogo.js'

const simulacro = process.argv.includes('--simulacro')
const horas = Number((process.argv.find(a => a.startsWith('--horas=')) || '').split('=')[1])
const desde = horas > 0 ? new Date(Date.now() - horas * 3600_000).toISOString() : null

console.log(`Obteniendo productos de Shopify${desde ? ` (modificados desde ${desde})` : ''}...`)

sincronizarCatalogo({ desde, simulacro, log: console.log })
  .then((r) => {
    console.log(`\n  Productos: ${r.productos} · variantes: ${r.variantes} · con niveles: ${r.conNiveles} · con modo de uso: ${r.conModo} · sin componente: ${r.sinComponente}`)
    console.log(`  Por estado en Shopify: ${JSON.stringify(r.porEstado)}`)
    if (!r.columnaStatus) console.log('  ⚠ La columna product_catalog.status no existe: corre scripts/alter_product_catalog_status.sql y vuelve a sincronizar.')

    if (r.simulacro) {
      console.log('\n── SIMULACRO (no se escribió nada) ──')
      console.log(`  filas nuevas que se crearían: ${r.nuevas.length}`)
      r.nuevas.slice(0, 10).forEach(x => console.log(`     + ${x.sku || x.variant_id}  ${(x.brand || '—').padEnd(18)} ${x.title.slice(0, 50)}`))
      console.log(`  filas existentes que cambiarían, por columna: ${JSON.stringify(r.cambios)}`)
      for (const [k, lista] of Object.entries(r.ejemplos)) {
        console.log(`  ejemplos de "${k}":`)
        lista.slice(0, 5).forEach(x => console.log(`     ${x}`))
      }
      return
    }
    console.log(`\n✅ Sync completo — ${r.upserted} variantes en product_catalog`)
  })
  .catch((err) => {
    console.error('❌ Error:', err.message)
    process.exit(1)
  })
