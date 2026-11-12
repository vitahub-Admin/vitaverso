// Comisión de Vitahub por cada reserva de cita. Vive en platform_settings (clave
// booking_commission_rate, editable desde admin-pagos); si no está, 10 %.
// Es la misma que usa el webhook de pagos para calcular la ganancia del profesional.
import { createClient } from "@supabase/supabase-js";

export const COMISION_BOOKING_POR_DEFECTO = 0.10;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function tasaComisionBooking() {
  try {
    const { data } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "booking_commission_rate")
      .maybeSingle();
    const n = Number(data?.value);
    return Number.isFinite(n) && n >= 0 && n < 1 ? n : COMISION_BOOKING_POR_DEFECTO;
  } catch {
    return COMISION_BOOKING_POR_DEFECTO;
  }
}
