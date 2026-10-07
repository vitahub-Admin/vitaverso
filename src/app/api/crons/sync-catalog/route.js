// GET|POST /api/crons/sync-catalog
// Mantiene product_catalog al día con Shopify, sin que nadie tenga que correr un script.
// Protegido con Authorization: Bearer CRON_SECRET (Vercel Cron lo manda solo).
//
//   ?modo=incremental (default) → solo productos modificados en las últimas 3 horas.
//                                 Corre cada hora: un producto nuevo aparece en menos de una.
//   ?modo=completo              → repasa todo el catálogo. Corre una vez al día, por si algo
//                                 cambió sin mover la fecha de modificación del producto
//                                 (por ejemplo, el nombre de una marca en su metaobjeto).
//
// La ventana de 3 horas es más ancha que el intervalo de 1 hora a propósito: si una
// corrida falla o se retrasa, la siguiente igual alcanza lo que se perdió. Es seguro
// repetir: todo es upsert por variante.

import { NextResponse } from 'next/server'
import { sincronizarCatalogo } from '@/lib/syncCatalogo'

export const runtime = 'nodejs'
export const maxDuration = 300   // el completo recorre ~2,400 productos

const VENTANA_INCREMENTAL_HORAS = 3

async function manejar(req) {
  const secreto = process.env.CRON_SECRET
  // Sin secreto configurado nadie entra: comparar contra "Bearer undefined" dejaría
  // pasar a quien mande justamente ese texto.
  if (!secreto || req.headers.get('Authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const modo = new URL(req.url).searchParams.get('modo') === 'completo' ? 'completo' : 'incremental'
  const desde = modo === 'incremental'
    ? new Date(Date.now() - VENTANA_INCREMENTAL_HORAS * 3600_000).toISOString()
    : null

  const inicio = Date.now()
  try {
    const r = await sincronizarCatalogo({ desde })
    console.log(`[sync-catalog] ${modo}: ${r.productos} productos, ${r.upserted} variantes, ${Math.round((Date.now() - inicio) / 1000)}s`)
    return NextResponse.json({ ok: true, modo, segundos: Math.round((Date.now() - inicio) / 1000), ...r })
  } catch (err) {
    console.error('[sync-catalog]', modo, err.message)
    return NextResponse.json({ ok: false, modo, error: err.message }, { status: 500 })
  }
}

export const GET  = manejar   // Vercel Cron llama por GET
export const POST = manejar   // y un disparador externo puede llamar por POST
