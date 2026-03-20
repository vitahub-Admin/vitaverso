
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function syncInviteesMatch() {
  console.log('🔹 Iniciando re-match invitees...');

  // Traer todos los invitees sin affiliate_id
  const { data: invitees, error } = await supabase
    .from('scheduled_call_invitees')
    .select('id, email')
    .is('affiliate_id', null)
    .not('email', 'is', null);

  if (error) {
    console.error('❌ Error obteniendo invitees:', error.message);
    throw error;
  }

  console.log(`🔹 Invitees sin match: ${invitees.length}`);

  let matched = 0;

  for (const invitee of invitees) {
    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id')
      .eq('email', invitee.email)
      .single();

    if (affiliate?.id) {
      await supabase
        .from('scheduled_call_invitees')
        .update({ affiliate_id: affiliate.id })
        .eq('id', invitee.id);
      matched++;
    }
  }

  console.log(`✅ Re-match completado: ${matched} de ${invitees.length}`);
  return { total: invitees.length, matched };
}