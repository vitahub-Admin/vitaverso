// scripts/vambeBackfill.js

import { createClient } from '@supabase/supabase-js';
import { upsertAffiliate } from '../src/app/services/vambeService.js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function backfill() {
  console.log('🚀 Iniciando backfill de afiliados a Vambe...\n');

  // Traer todos los afiliados con teléfono
  const { data: affiliates, error } = await supabase
    .from('affiliates')
    .select('*')
    .not('phone', 'is', null)
    .neq('phone', '');

  if (error) {
    console.error('❌ Error obteniendo afiliados:', error.message);
    process.exit(1);
  }

  console.log(`📋 Afiliados con teléfono: ${affiliates.length}\n`);

  const results = { ok: 0, skipped: 0, error: 0 };

  for (const affiliate of affiliates) {
    try {
      const result = await upsertAffiliate(affiliate, supabase);

      if (!result) {
        console.log(`⏭️  Skipped: ${affiliate.id} - ${affiliate.first_name} ${affiliate.last_name}`);
        results.skipped++;
      } else {
        console.log(`✅ OK: ${affiliate.id} - ${affiliate.first_name} ${affiliate.last_name} → ${result.vambeContactId}`);
        results.ok++;
      }

    } catch (err) {
      console.error(`❌ Error: ${affiliate.id} - ${affiliate.first_name} ${affiliate.last_name}: ${err.message}`);
      results.error++;
    }

    // Delay para no saturar la API de Vambe
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n─────────────────────────────');
  console.log(`✅ OK:      ${results.ok}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);
  console.log(`❌ Errors:  ${results.error}`);
  console.log('─────────────────────────────');
  console.log('🏁 Backfill finalizado');
}

backfill();