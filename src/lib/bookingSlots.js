// Calcula slots disponibles para un afiliado en una fecha dada.
// Recibe disponibilidad semanal, citas existentes, bloqueos y (opcional) busy times de Google Calendar.

const PENDING_EXPIRY_MINUTES = 30;

/**
 * Genera slots disponibles para una fecha y duración dadas.
 *
 * @param {string} date - "YYYY-MM-DD" en timezone del afiliado
 * @param {number} durationMinutes
 * @param {Array<{start_time, end_time}>} availability - franjas del día
 * @param {Array<{starts_at, ends_at, created_at}>} appointments - citas en esa fecha
 * @param {Array<{start_time, end_time}>} blockedSlots - bloqueos en esa fecha
 * @param {Array<{start, end}>} calendarBusy - busy times de Google Calendar (ISO strings)
 * @returns {string[]} - array de horarios disponibles en formato "HH:MM"
 */
export function computeAvailableSlots(
  date,
  durationMinutes,
  availability,
  appointments,
  blockedSlots,
  calendarBusy = []
) {
  if (!availability.length) return [];

  const now = new Date();
  const expiryThreshold = new Date(now.getTime() - PENDING_EXPIRY_MINUTES * 60 * 1000);

  // Citas activas (pending_payment dentro de los últimos 30 min, o confirmed)
  const activeAppointments = appointments.filter((a) => {
    if (a.status === "confirmed") return true;
    if (a.status === "pending_payment") {
      return new Date(a.created_at) > expiryThreshold;
    }
    return false;
  });

  const slots = [];

  for (const window of availability) {
    const [startH, startM] = window.start_time.split(":").map(Number);
    const [endH, endM] = window.end_time.split(":").map(Number);

    const windowStart = startH * 60 + startM;
    const windowEnd = endH * 60 + endM;

    for (let t = windowStart; t + durationMinutes <= windowEnd; t += durationMinutes) {
      const slotStart = t;
      const slotEnd = t + durationMinutes;

      // Slot en el pasado
      const slotDateTime = new Date(`${date}T${toHHMM(slotStart)}:00`);
      if (slotDateTime <= now) continue;

      // Bloqueado manualmente (día completo o franja)
      const isManuallyBlocked = blockedSlots.some((b) => {
        if (!b.start_time && !b.end_time) return true; // día completo
        const bStart = timeToMinutes(b.start_time);
        const bEnd = timeToMinutes(b.end_time);
        return slotStart < bEnd && slotEnd > bStart;
      });
      if (isManuallyBlocked) continue;

      // Solapamiento con cita existente
      const isBooked = activeAppointments.some((a) => {
        const aStart = new Date(a.starts_at);
        const aEnd = new Date(a.ends_at);
        const aStartMin = aStart.getHours() * 60 + aStart.getMinutes();
        const aEndMin = aEnd.getHours() * 60 + aEnd.getMinutes();
        return slotStart < aEndMin && slotEnd > aStartMin;
      });
      if (isBooked) continue;

      // Solapamiento con Google Calendar busy
      const slotDateStart = new Date(`${date}T${toHHMM(slotStart)}:00`);
      const slotDateEnd = new Date(`${date}T${toHHMM(slotEnd)}:00`);
      const isCalendarBusy = calendarBusy.some((b) => {
        const bStart = new Date(b.start);
        const bEnd = new Date(b.end);
        return slotDateStart < bEnd && slotDateEnd > bStart;
      });
      if (isCalendarBusy) continue;

      slots.push(toHHMM(slotStart));
    }
  }

  return slots;
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(minutes) {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
