"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Cookies from "js-cookie";
import {
  CalendarDays, Clock, Mail, Phone, Video, CircleCheck, CircleX, CheckCheck, Pencil, Trash2,
  Copy, ExternalLink, Plus, MessageCircle, UserRound, Briefcase, Link2, TriangleAlert, Hourglass,
  Check, ChevronDown, X,
} from "lucide-react";
import { zonedToDate, localDateStr, localTimeStr, formatoCita } from "@/lib/bookingTz";

const FULL_DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// ── Estilos compartidos (tokens de marca de globals.css) ─────────────────────
const campo =
  "w-full border border-borde bg-white rounded-campo px-3 py-2 text-sm text-azul-profundo placeholder:text-decorativo focus:outline-none focus:border-celeste focus:shadow-foco transition";
const tarjeta = "bg-white border border-borde rounded-tarjeta shadow-tarjeta";
const btnAzul = "bg-azul text-white hover:bg-azul-hover rounded-boton font-semibold transition-colors disabled:opacity-60";
const btnCeleste = "bg-celeste text-azul-profundo hover:bg-celeste-hover rounded-boton font-semibold transition-colors disabled:opacity-60";
const btnBorde = "border border-borde bg-white text-azul hover:bg-pagina rounded-boton font-semibold transition-colors";
const etiqueta = "block text-xs font-semibold text-texto-secundario mb-1";

// Estado de la cita: el color acompaña siempre a un ícono y a un texto
const ESTADOS = {
  confirmed:       { label: "Confirmada",     Icon: CircleCheck, chip: "bg-[#D1FAE5]", icono: "text-[#10B981]", barra: "bg-[#10B981]" },
  completed:       { label: "Completada",     Icon: CheckCheck,  chip: "bg-celeste-suave", icono: "text-celeste-texto", barra: "bg-celeste" },
  pending:         { label: "Pendiente",      Icon: Hourglass,   chip: "bg-[#FEF3C7]", icono: "text-[#F59E0B]", barra: "bg-[#F59E0B]" },
  pending_payment: { label: "Esperando pago", Icon: Hourglass,   chip: "bg-[#FEF3C7]", icono: "text-[#F59E0B]", barra: "bg-[#F59E0B]" },
  cancelled:       { label: "Cancelada",      Icon: CircleX,     chip: "bg-[#FEE2E2]", icono: "text-[#EF4444]", barra: "bg-decorativo" },
};

function ChipEstado({ status }) {
  const e = ESTADOS[status] || ESTADOS.pending;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold text-azul-profundo px-2.5 py-1 rounded-full ${e.chip}`}>
      <e.Icon size={14} className={e.icono} />
      {e.label}
    </span>
  );
}

// Genera opciones de tiempo cada 30 minutos
function timeOptions() {
  const opts = [];
  for (let h = 6; h <= 22; h++) {
    opts.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 22) opts.push(`${String(h).padStart(2, "0")}:30`);
  }
  return opts;
}
const TIME_OPTIONS = timeOptions();

function Modal({ titulo, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-azul-profundo/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-tarjeta p-6 w-full max-w-md shadow-ventana" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-azul text-lg">{titulo}</h3>
          {onClose && (
            <button onClick={onClose} aria-label="Cerrar" className="text-texto-secundario hover:text-azul p-1 -mr-1">
              <X size={18} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function AvailabilityEditor({ availability, setAvailability, authHeaders }) {
  // Estado local: { 0: [{start, end}], 1: [...], ... }
  const [schedule, setSchedule] = useState(() => buildSchedule(availability));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSchedule(buildSchedule(availability));
  }, [availability]);

  function buildSchedule(avail) {
    const s = {};
    for (let i = 0; i < 7; i++) {
      const daySlots = avail.filter((a) => a.day_of_week === i);
      s[i] = daySlots.length > 0
        ? daySlots.map((a) => ({ start: a.start_time.slice(0, 5), end: a.end_time.slice(0, 5) }))
        : null; // null = día desactivado
    }
    return s;
  }

  function toggleDay(i) {
    setSchedule((prev) => ({
      ...prev,
      [i]: prev[i] === null ? [{ start: "09:00", end: "17:00" }] : null,
    }));
  }

  function updateSlot(day, idx, field, value) {
    setSchedule((prev) => {
      const slots = [...prev[day]];
      slots[idx] = { ...slots[idx], [field]: value };
      return { ...prev, [day]: slots };
    });
  }

  function addSlot(day) {
    setSchedule((prev) => ({
      ...prev,
      [day]: [...prev[day], { start: "14:00", end: "18:00" }],
    }));
  }

  function removeSlot(day, idx) {
    setSchedule((prev) => {
      const slots = prev[day].filter((_, i) => i !== idx);
      return { ...prev, [day]: slots.length > 0 ? slots : null };
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const slots = [];
    for (let i = 0; i < 7; i++) {
      if (!schedule[i]) continue;
      for (const s of schedule[i]) {
        if (s.start >= s.end) continue; // ignorar franjas inválidas
        slots.push({ day_of_week: i, start_time: s.start, end_time: s.end });
      }
    }

    try {
      const res = await fetch("/api/booking/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ slots }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setAvailability(data.data || []);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`${tarjeta} p-5`}>
      <h3 className="font-bold text-azul mb-1">Tu horario semanal</h3>
      <p className="text-sm text-texto-secundario mb-4">
        Los turnos disponibles se generan solos según la duración de cada servicio. Todos los horarios son en hora de Ciudad de México.
      </p>

      <div className="space-y-2">
        {FULL_DAYS.map((dayName, i) => {
          const activo = schedule[i] !== null;
          return (
            <div key={i} className={`rounded-boton border p-3 transition-colors ${activo ? "border-celeste-borde bg-celeste-fondo/50" : "border-separador bg-white"}`}>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => toggleDay(i)} className="flex items-center gap-3" aria-pressed={activo}>
                  <span className={`w-10 h-6 rounded-full relative transition-colors ${activo ? "bg-celeste" : "bg-borde"}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${activo ? "left-5" : "left-1"}`} />
                  </span>
                  <span className={`text-sm font-semibold ${activo ? "text-azul" : "text-texto-secundario"}`}>{dayName}</span>
                </button>
                {activo ? (
                  <button type="button" onClick={() => addSlot(i)} className="text-xs font-semibold text-celeste-texto hover:text-azul inline-flex items-center gap-1">
                    <Plus size={14} /> Franja
                  </button>
                ) : (
                  <span className="text-xs text-texto-secundario">No disponible</span>
                )}
              </div>

              {activo && (
                <div className="space-y-2 mt-3 sm:ml-13">
                  {schedule[i].map((slot, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select value={slot.start} onChange={(e) => updateSlot(i, idx, "start", e.target.value)} className={`${campo} !w-auto`}>
                        {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span className="text-texto-secundario text-sm">a</span>
                      <select value={slot.end} onChange={(e) => updateSlot(i, idx, "end", e.target.value)} className={`${campo} !w-auto`}>
                        {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {schedule[i].length > 1 && (
                        <button type="button" onClick={() => removeSlot(i, idx)} aria-label="Quitar franja" className="text-texto-secundario hover:text-[#EF4444] p-1">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className={`${btnAzul} px-6 py-2.5 text-sm`}>
          {saving ? "Guardando..." : "Guardar horario"}
        </button>
        {saved && <span className="text-azul text-sm inline-flex items-center gap-1"><Check size={16} className="text-[#10B981]" /> Guardado</span>}
        {error && <span className="text-[#B91C1C] text-sm">{error}</span>}
      </div>
    </div>
  );
}

function getAuthToken() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )proJwt=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Las citas siempre se ven y se editan en la hora de México (la del profesional),
// sin importar en qué huso esté el navegador.
function toLocalDatetimeInputs(isoString) {
  return { date: localDateStr(isoString), time: localTimeStr(isoString) };
}

function toISO(date, time) {
  return zonedToDate(date, time).toISOString();
}

function AppointmentEditor({ appointment, authHeaders, onSave, onClose }) {
  const start = toLocalDatetimeInputs(appointment.starts_at);
  const end   = toLocalDatetimeInputs(appointment.ends_at);

  const [form, setForm] = useState({
    status:          appointment.status,
    date:            start.date,
    start_time:      start.time,
    end_time:        end.time,
    affiliate_notes: appointment.affiliate_notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/booking/appointments?id=${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          status:          form.status,
          starts_at:       toISO(form.date, form.start_time),
          ends_at:         toISO(form.date, form.end_time),
          affiliate_notes: form.affiliate_notes,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onSave(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal titulo="Editar cita" onClose={onClose}>
      <p className="text-sm text-texto-secundario mb-4">{appointment.client_name} · {appointment.booking_services?.name}</p>

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className={etiqueta}>Estado</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={campo}>
            <option value="pending">Pendiente</option>
            <option value="confirmed">Confirmada</option>
            <option value="completed">Completada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>

        <div>
          <label className={etiqueta}>Fecha</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={campo} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={etiqueta}>Hora de inicio</label>
            <select value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className={campo}>
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={etiqueta}>Hora de fin</label>
            <select value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className={campo}>
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-texto-secundario -mt-1">Hora de Ciudad de México.</p>

        <div>
          <label className={etiqueta}>Notas internas</label>
          <textarea rows={3} placeholder="Notas visibles solo para ti..." value={form.affiliate_notes}
            onChange={(e) => setForm({ ...form, affiliate_notes: e.target.value })} className={`${campo} resize-none`} />
        </div>

        {error && <p className="text-xs text-[#B91C1C]">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`${btnBorde} flex-1 text-sm py-2.5`}>Cancelar</button>
          <button type="submit" disabled={saving} className={`${btnAzul} flex-1 text-sm py-2.5`}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Cuánto se queda el profesional de un precio, después de la comisión de Vitahub
function montoNeto(precio, tasa) {
  const p = Number(precio);
  if (!(p > 0)) return null;
  return Math.round(p * (1 - tasa) * 100) / 100;
}

function porcentaje(tasa) {
  return `${Math.round(tasa * 1000) / 10}`.replace(/\.0$/, "");
}

// Aviso bajo el campo de precio: Vitahub cobra una comisión y esto es lo que recibes
function AvisoComision({ precio, tasa }) {
  const neto = montoNeto(precio, tasa);
  return (
    <p className="text-xs text-texto-secundario bg-celeste-fondo rounded-campo px-3 py-2">
      Vitahub cobra {porcentaje(tasa)} % de cada reserva por el uso de la plataforma.
      {neto !== null && (
        <> Con este precio recibirás <strong className="text-azul">${neto.toLocaleString("es-MX")}</strong> por cita.</>
      )}
    </p>
  );
}

function ServiceEditForm({ service, authHeaders, onSave, onCancel, commissionRate }) {
  const [form, setForm] = useState({
    name:             service.name,
    description:      service.description || "",
    duration_minutes: service.duration_minutes,
    price:            service.price,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/booking/services?id=${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onSave(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-2.5">
      <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Nombre del servicio" className={campo} />
      <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
        placeholder="Descripción (opcional)" className={campo} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={etiqueta}>Duración (min)</label>
          <input required type="number" value={form.duration_minutes}
            onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} className={campo} />
        </div>
        <div>
          <label className={etiqueta}>Precio (MXN)</label>
          <input required type="number" value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })} className={campo} />
        </div>
      </div>
      <AvisoComision precio={form.price} tasa={commissionRate} />
      {error && <p className="text-xs text-[#B91C1C]">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className={`${btnBorde} flex-1 text-sm py-2`}>Cancelar</button>
        <button type="submit" disabled={saving} className={`${btnAzul} flex-1 text-sm py-2`}>
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}

function ProfileEditor({ affiliate, authHeaders, onSave }) {
  const [form, setForm]       = useState({ specialty: affiliate?.specialty || "", bio: affiliate?.bio || "" });
  const [saving, setSaving]   = useState(false);
  const [saved,  setSaved]    = useState(false);
  const [error,  setError]    = useState(null);

  useEffect(() => {
    setForm({ specialty: affiliate?.specialty || "", bio: affiliate?.bio || "" });
  }, [affiliate?.specialty, affiliate?.bio]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/booking/affiliate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ specialty: form.specialty, bio: form.bio }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      onSave({ specialty: form.specialty, bio: form.bio });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`${tarjeta} p-5`}>
      <h3 className="font-bold text-azul mb-3">Información de perfil</h3>
      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className={etiqueta}>Especialidad</label>
          <input type="text" placeholder="Ej: Nutricionista, Médico funcional..." value={form.specialty}
            onChange={(e) => setForm({ ...form, specialty: e.target.value })} className={campo} />
        </div>
        <div>
          <label className={etiqueta}>Descripción para tus clientes</label>
          <textarea rows={3} placeholder="Ej: Especialista en nutrición deportiva con 10 años de experiencia..."
            value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className={`${campo} resize-none`} />
        </div>
        {error && <p className="text-xs text-[#B91C1C]">{error}</p>}
        {saved && <p className="text-xs text-azul inline-flex items-center gap-1"><Check size={14} className="text-[#10B981]" /> Guardado correctamente</p>}
        <button type="submit" disabled={saving} className={`${btnAzul} w-full text-sm py-2.5`}>
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}

// ── Agenda: agrupar por día ──────────────────────────────────────────────────
function agruparPorDia(lista) {
  const m = new Map();
  for (const a of lista) {
    const k = localDateStr(a.starts_at);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(a);
  }
  return [...m.entries()];
}

function etiquetaDia(clave) {
  const hoy = localDateStr(new Date());
  const manana = localDateStr(new Date(Date.now() + 86400000));
  const [y, mo, d] = clave.split("-").map(Number);
  const texto = new Date(Date.UTC(y, mo - 1, d, 12)).toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
  if (clave === hoy) return `Hoy · ${texto}`;
  if (clave === manana) return `Mañana · ${texto}`;
  return texto;
}

function TarjetaCita({ a, proxima, onEditar, onCancelar }) {
  const est = ESTADOS[a.status] || ESTADOS.pending;
  const cuando = formatoCita(a.starts_at);
  const duracion = a.booking_services?.duration_minutes;
  const tel = a.client_phone ? String(a.client_phone).replace(/\D/g, "") : "";
  return (
    <div className={`${tarjeta} overflow-hidden flex ${a.status === "cancelled" ? "opacity-70" : ""}`}>
      <div className={`w-1.5 shrink-0 ${est.barra}`} />
      <div className="flex-1 p-4 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 w-14 text-center">
              <p className="text-lg font-bold text-azul tabular-nums leading-none">{cuando.hora}</p>
              {duracion && <p className="text-[11px] text-texto-secundario mt-1">{duracion} min</p>}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-azul-profundo text-sm truncate">{a.client_name}</p>
              <p className="text-xs text-texto-secundario truncate">{a.booking_services?.name}</p>
            </div>
          </div>
          <ChipEstado status={a.status} />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-texto-secundario">
          {a.client_email && (
            <a href={`mailto:${a.client_email}`} className="inline-flex items-center gap-1.5 hover:text-azul min-w-0">
              <Mail size={14} className="shrink-0" /> <span className="truncate">{a.client_email}</span>
            </a>
          )}
          {a.client_phone && (
            <a href={`tel:${a.client_phone}`} className="inline-flex items-center gap-1.5 hover:text-azul">
              <Phone size={14} /> {a.client_phone}
            </a>
          )}
          {tel && (
            <a href={`https://wa.me/${tel}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-azul">
              <MessageCircle size={14} /> WhatsApp
            </a>
          )}
        </div>

        {a.client_notes && (
          <p className="mt-3 text-xs text-azul-profundo bg-pagina border border-separador rounded-campo px-3 py-2 italic">
            “{a.client_notes}”
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {proxima && a.status === "confirmed" && a.meet_link && (
            <a href={a.meet_link} target="_blank" rel="noopener noreferrer" className={`${btnCeleste} text-xs px-3 py-1.5 inline-flex items-center gap-1.5`}>
              <Video size={14} /> Unirse a la videollamada
            </a>
          )}
          <button onClick={onEditar} className="text-xs font-semibold text-celeste-texto hover:text-azul inline-flex items-center gap-1 px-1.5 py-1">
            <Pencil size={13} /> Editar
          </button>
          {a.status === "confirmed" && (
            <button onClick={onCancelar} className="text-xs font-semibold text-[#B91C1C] hover:text-[#7F1D1D] inline-flex items-center gap-1 px-1.5 py-1">
              <CircleX size={13} /> Cancelar cita
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Estadistica({ valor, texto }) {
  return (
    <div className={`${tarjeta} px-4 py-3`}>
      <p className="text-2xl font-bold text-azul tabular-nums leading-none">{valor}</p>
      <p className="text-xs text-texto-secundario mt-1.5">{texto}</p>
    </div>
  );
}

export default function BookingDashboard() {
  const params = useSearchParams();
  const calendarStatus = params.get("calendar");
  const calendarError = params.get("error");

  const [affiliate, setAffiliate] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [editingService, setEditingService] = useState(null);
  const [copied, setCopied] = useState(false);
  const [services, setServices] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("agenda"); // agenda | services | availability | profile
  const [verAnteriores, setVerAnteriores] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginStep, setLoginStep] = useState("correo"); // correo → codigo
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Setup modal
  const [showSetup, setShowSetup] = useState(false);
  const [setup, setSetup] = useState({ bio: "" });
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState(null);

  // Nueva cita / servicio
  const [newService, setNewService] = useState({ name: "", duration_minutes: 60, price: "", description: "" });
  const [savingService, setSavingService] = useState(false);
  // Comisión de Vitahub por reserva (viene del servidor; 10 % si no llega)
  const [commissionRate, setCommissionRate] = useState(0.10);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const headers = authHeaders();

    const [affRaw, apptRes, svcRes, availRes] = await Promise.all([
      fetch("/api/booking/affiliate", { headers }).then(async (r) => ({ status: r.status, ...(await r.json()) })).catch(() => null),
      fetch("/api/booking/appointments", { headers }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/booking/services", { headers }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/booking/availability", { headers }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]);

    if (affRaw && !affRaw.error) {
      setAffiliate(affRaw);
    } else if (!affRaw || affRaw.status === 401) {
      setNeedsLogin(true);
    } else {
      // 404: autenticado pero sin perfil de booking → primera vez
      setShowSetup(true);
    }

    setAppointments(apptRes?.data || []);
    setServices(svcRes?.data || []);
    if (typeof svcRes?.commission_rate === "number") setCommissionRate(svcRes.commission_rate);
    setAvailability(availRes?.data || []);
    setLoading(false);
  }

  // Acceso sin contraseña: primero el correo, luego el código de 6 dígitos que llega a él
  async function handleBookingLogin(e) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      if (loginStep === "correo") {
        const res = await fetch("/api/pro/auth/code/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: loginEmail.trim() }),
        });
        const data = await res.json();
        if (data.ok) { setLoginCode(""); setLoginStep("codigo"); }
        else setLoginError(data.error || "No pudimos enviar el código. Intenta de nuevo.");
        return;
      }
      const res = await fetch("/api/pro/auth/code/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), code: loginCode }),
      });
      const data = await res.json();
      if (data.ok && data.token) {
        Cookies.set("proJwt", data.token, { expires: 30 });
        setNeedsLogin(false);
        setLoginEmail(""); setLoginCode(""); setLoginStep("correo");
        loadAll();
      } else {
        setLoginError(data.error || "El código es incorrecto o ya venció");
      }
    } catch {
      setLoginError("Error de conexión");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleSetup(e) {
    e.preventDefault();
    setSetupSaving(true);
    setSetupError(null);
    try {
      const res = await fetch("/api/booking/affiliate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(setup),
      });
      const data = await res.json();
      if (data.error) {
        setSetupError(data.error);
      } else {
        setAffiliate(data);
        setShowSetup(false);
        loadAll();
      }
    } catch {
      setSetupError("Error de conexión");
    } finally {
      setSetupSaving(false);
    }
  }

  async function handleAddService(e) {
    e.preventDefault();
    setSavingService(true);
    const res = await fetch("/api/booking/services", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(newService),
    });
    const data = await res.json();
    setSavingService(false);
    if (!data.error) {
      setServices((prev) => [...prev, data]);
      setNewService({ name: "", duration_minutes: 60, price: "", description: "" });
    }
  }

  async function handleDeleteService(s) {
    if (!confirm(`¿Eliminar el servicio "${s.name}"? Tus pacientes ya no podrán reservarlo.`)) return;
    await fetch(`/api/booking/services?id=${s.id}`, { method: "DELETE", headers: authHeaders() });
    setServices((prev) => prev.filter((x) => x.id !== s.id));
  }

  async function handleCancelAppointment(a) {
    const aviso = `¿Cancelar la cita de ${a.client_name}? Avísale a tu paciente: el reembolso no es automático.`;
    if (!confirm(aviso)) return;
    await fetch(`/api/booking/appointments?id=${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status: "cancelled" }),
    });
    setAppointments((prev) => prev.map((x) => x.id === a.id ? { ...x, status: "cancelled" } : x));
  }

  function copiarLink() {
    navigator.clipboard.writeText(`${window.location.origin}/book/${affiliate?.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <div className="min-h-screen bg-pagina flex items-center justify-center text-texto-secundario text-sm">Cargando...</div>;
  }

  if (needsLogin) {
    return (
      <div className="min-h-screen bg-pagina flex items-center justify-center p-4">
        <div className={`${tarjeta} p-8 w-full max-w-sm`}>
          <div className="w-11 h-11 rounded-full bg-celeste-suave flex items-center justify-center mb-4">
            <CalendarDays size={22} className="text-celeste-texto" />
          </div>
          <h2 className="text-lg font-bold text-azul mb-1">Accede a tus citas</h2>
          <p className="text-sm text-texto-secundario mb-6">
            {loginStep === "correo"
              ? "Escribe el correo de tu cuenta de profesional Vitahub y te enviamos un código."
              : <>Si <strong className="text-azul">{loginEmail}</strong> tiene una cuenta, te enviamos un código de 6 dígitos.</>}
          </p>
          <form onSubmit={handleBookingLogin} className="flex flex-col gap-3">
            {loginStep === "correo" ? (
              <input type="email" required placeholder="Correo electrónico" autoComplete="email"
                value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className={`${campo} !py-3`} />
            ) : (
              <input type="text" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
                placeholder="000000" value={loginCode} onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, ""))}
                className={`${campo} !py-3 text-center text-xl font-bold tracking-[0.5em]`} />
            )}
            {loginError && <p className="text-[#B91C1C] text-xs text-center">{loginError}</p>}
            <button type="submit" disabled={loginLoading} className={`${btnAzul} py-3 text-sm`}>
              {loginLoading ? "Un momento..." : loginStep === "correo" ? "Enviarme el código" : "Ingresar"}
            </button>
            {loginStep === "codigo" && (
              <button type="button" onClick={() => { setLoginStep("correo"); setLoginError(""); }}
                className="text-xs text-texto-secundario hover:text-azul">Cambiar correo</button>
            )}
          </form>
        </div>
      </div>
    );
  }

  // ── Datos de la agenda ─────────────────────────────────────────────────────
  const ahora = new Date();
  const hoyClave = localDateStr(ahora);
  const mesClave = hoyClave.slice(0, 7);
  const vigentes = appointments.filter((a) => {
    if (a.status === "expired") return false;
    // Un pago que no se completó en 30 min ya no cuenta como cita
    if (a.status === "pending_payment" && new Date(a.created_at) < new Date(Date.now() - 30 * 60 * 1000)) return false;
    return true;
  });
  const proximas = vigentes
    .filter((a) => a.status !== "cancelled" && a.status !== "completed" && new Date(a.ends_at) >= ahora)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const anteriores = vigentes
    .filter((a) => !proximas.includes(a))
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  const citasHoy = proximas.filter((a) => localDateStr(a.starts_at) === hoyClave && a.status === "confirmed").length;
  const citasProximas = proximas.filter((a) => a.status === "confirmed").length;
  const citasMes = vigentes.filter((a) => ["confirmed", "completed"].includes(a.status) && localDateStr(a.starts_at).slice(0, 7) === mesClave).length;

  const TABS = [
    { key: "agenda", label: "Agenda", Icon: CalendarDays },
    { key: "services", label: "Servicios", Icon: Briefcase },
    { key: "availability", label: "Horario", Icon: Clock },
    { key: "profile", label: "Perfil", Icon: UserRound },
  ];

  return (
    <div className="min-h-screen bg-pagina">
      {/* Setup modal (primera vez) */}
      {showSetup && (
        <Modal titulo="Activa tu página de citas">
          <p className="text-texto-secundario text-sm mb-4">
            Tu nombre, especialidad y foto se cargan automáticamente desde tu perfil de Vitahub.
          </p>
          <form onSubmit={handleSetup} className="space-y-3">
            <div>
              <label className={etiqueta}>Descripción para tus clientes (opcional)</label>
              <textarea rows={3} placeholder="Ej: Especialista en nutrición deportiva con 10 años de experiencia..."
                value={setup.bio} onChange={(e) => setSetup({ ...setup, bio: e.target.value })} className={`${campo} resize-none`} />
            </div>
            <button type="submit" disabled={setupSaving} className={`${btnAzul} w-full py-3 text-sm`}>
              {setupSaving ? "Activando..." : "Activar mi página de citas"}
            </button>
            {setupError && <p className="text-[#B91C1C] text-xs text-center">{setupError}</p>}
          </form>
        </Modal>
      )}

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Encabezado */}
        <div className={`${tarjeta} p-5`}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-celeste-suave flex items-center justify-center shrink-0">
              {affiliate?.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={affiliate.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-bold text-azul">{(affiliate?.display_name || "?").trim().charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-bold text-azul text-lg leading-tight truncate">{affiliate?.display_name || "Mis citas"}</h1>
              {affiliate?.specialty && <p className="text-sm text-texto-secundario truncate">{affiliate.specialty}</p>}
            </div>
          </div>

          {affiliate?.slug && (
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-2 bg-pagina border border-separador rounded-boton px-3 py-2 text-sm text-azul-profundo">
                <Link2 size={16} className="text-celeste-texto shrink-0" />
                <span className="truncate">{typeof window !== "undefined" ? window.location.host : "pro.vitahub.mx"}/book/{affiliate.slug}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={copiarLink} className={`${btnCeleste} text-sm px-4 py-2 inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none`}>
                  {copied ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar link</>}
                </button>
                <a href={`/book/${affiliate.slug}`} target="_blank" rel="noopener noreferrer"
                  className={`${btnBorde} text-sm px-4 py-2 inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none`}>
                  <ExternalLink size={16} /> Ver
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Aviso: conectar Google Calendar */}
        {affiliate && !affiliate.google_calendar_token && (
          <div className="bg-[#FEF3C7] border border-[#F59E0B]/40 rounded-tarjeta p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <TriangleAlert size={20} className="text-[#F59E0B] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-azul-profundo font-semibold text-sm">Conecta Google Calendar para activar las videollamadas</p>
              <p className="text-texto-secundario text-xs mt-0.5">
                Sin Calendar, tus pacientes no reciben invitación ni enlace de Meet en el correo de confirmación.
                Con Calendar, cada cita queda agendada sola con videollamada incluida.
              </p>
            </div>
            <a href="/api/booking/calendar/connect" className={`${btnAzul} text-xs px-4 py-2 text-center whitespace-nowrap`}>
              Conectar ahora
            </a>
          </div>
        )}

        {calendarStatus === "connected" && (
          <div className="bg-[#D1FAE5] text-azul-profundo text-sm rounded-boton px-4 py-3 inline-flex items-center gap-2 w-full">
            <CircleCheck size={18} className="text-[#10B981]" /> Google Calendar conectado correctamente.
          </div>
        )}
        {calendarError && (
          <div className="bg-[#FEE2E2] text-azul-profundo text-sm rounded-boton px-4 py-3 inline-flex items-center gap-2 w-full">
            <CircleX size={18} className="text-[#EF4444]" /> No se pudo conectar Google Calendar. Intenta de nuevo.
          </div>
        )}

        {/* Pestañas */}
        <div className="flex gap-1 bg-white border border-borde rounded-tarjeta p-1 shadow-tarjeta">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 text-sm rounded-boton font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                tab === t.key ? "bg-celeste-fondo text-azul border border-celeste-borde" : "text-texto-secundario hover:text-azul border border-transparent"
              }`}>
              <t.Icon size={16} className={tab === t.key ? "text-celeste-texto" : ""} />
              <span className="hidden min-[400px]:inline">{t.label}</span>
              <span className="min-[400px]:hidden sr-only">{t.label}</span>
            </button>
          ))}
        </div>

        {/* AGENDA */}
        {tab === "agenda" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Estadistica valor={citasHoy} texto="Citas hoy" />
              <Estadistica valor={citasProximas} texto="Próximas" />
              <Estadistica valor={citasMes} texto="Este mes" />
            </div>

            {proximas.length === 0 && (
              <div className={`${tarjeta} p-8 text-center`}>
                <div className="w-12 h-12 rounded-full bg-celeste-fondo flex items-center justify-center mx-auto mb-3">
                  <CalendarDays size={22} className="text-celeste-texto" />
                </div>
                <p className="font-semibold text-azul">No tienes citas próximas</p>
                <p className="text-sm text-texto-secundario mt-1">Comparte tu link para empezar a recibir reservas.</p>
              </div>
            )}

            {agruparPorDia(proximas).map(([dia, citas]) => (
              <section key={dia} className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-texto-secundario first-letter:uppercase">{etiquetaDia(dia)}</h2>
                {citas.map((a) => (
                  <TarjetaCita key={a.id} a={a} proxima onEditar={() => setEditingAppointment(a)} onCancelar={() => handleCancelAppointment(a)} />
                ))}
              </section>
            ))}

            {anteriores.length > 0 && (
              <section className="space-y-2">
                <button onClick={() => setVerAnteriores((v) => !v)}
                  className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-texto-secundario hover:text-azul py-2">
                  <span>Anteriores y canceladas ({anteriores.length})</span>
                  <ChevronDown size={16} className={`transition-transform ${verAnteriores ? "rotate-180" : ""}`} />
                </button>
                {verAnteriores && anteriores.map((a) => (
                  <TarjetaCita key={a.id} a={a} proxima={false} onEditar={() => setEditingAppointment(a)} onCancelar={() => handleCancelAppointment(a)} />
                ))}
              </section>
            )}

            {editingAppointment && (
              <AppointmentEditor
                appointment={editingAppointment}
                authHeaders={authHeaders}
                onSave={(updated) => setAppointments((prev) => prev.map((a) => a.id === updated.id ? updated : a))}
                onClose={() => setEditingAppointment(null)}
              />
            )}
          </>
        )}

        {/* SERVICIOS */}
        {tab === "services" && (
          <>
            {services.filter((s) => s.is_active).map((s) => (
              <div key={s.id} className={`${tarjeta} p-4`}>
                {editingService?.id === s.id ? (
                  <ServiceEditForm
                    service={s}
                    commissionRate={commissionRate}
                    authHeaders={authHeaders}
                    onSave={(updated) => {
                      setServices((prev) => prev.map((x) => x.id === updated.id ? updated : x));
                      setEditingService(null);
                    }}
                    onCancel={() => setEditingService(null)}
                  />
                ) : (
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-azul-profundo">{s.name}</p>
                      {s.description && <p className="text-texto-secundario text-xs mt-0.5">{s.description}</p>}
                      <span className="inline-flex items-center gap-1 mt-2 text-xs text-azul bg-celeste-fondo rounded-full px-2.5 py-1">
                        <Clock size={13} className="text-celeste-texto" /> {s.duration_minutes} min
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-azul text-lg tabular-nums">${Number(s.price).toLocaleString("es-MX")}</p>
                      {montoNeto(s.price, commissionRate) !== null && (
                        <p className="text-celeste-texto text-xs font-semibold tabular-nums">Recibes ${montoNeto(s.price, commissionRate).toLocaleString("es-MX")}</p>
                      )}
                      <div className="flex gap-1 justify-end mt-2">
                        <button onClick={() => setEditingService(s)} aria-label="Editar servicio"
                          className="p-1.5 rounded-campo text-texto-secundario hover:text-azul hover:bg-pagina">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => handleDeleteService(s)} aria-label="Eliminar servicio"
                          className="p-1.5 rounded-campo text-texto-secundario hover:text-[#B91C1C] hover:bg-[#FEE2E2]">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="bg-white border border-dashed border-celeste-borde rounded-tarjeta p-5">
              <h3 className="font-bold text-azul mb-3 inline-flex items-center gap-1.5"><Plus size={18} className="text-celeste-texto" /> Agregar servicio</h3>
              <form onSubmit={handleAddService} className="space-y-2.5">
                <input required placeholder="Nombre del servicio" value={newService.name}
                  onChange={(e) => setNewService({ ...newService, name: e.target.value })} className={campo} />
                <input placeholder="Descripción (opcional)" value={newService.description}
                  onChange={(e) => setNewService({ ...newService, description: e.target.value })} className={campo} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={etiqueta}>Duración (min)</label>
                    <input required type="number" value={newService.duration_minutes}
                      onChange={(e) => setNewService({ ...newService, duration_minutes: e.target.value })} className={campo} />
                  </div>
                  <div>
                    <label className={etiqueta}>Precio (MXN)</label>
                    <input required type="number" value={newService.price}
                      onChange={(e) => setNewService({ ...newService, price: e.target.value })} className={campo} />
                  </div>
                </div>
                <AvisoComision precio={newService.price} tasa={commissionRate} />
                <button type="submit" disabled={savingService} className={`${btnAzul} w-full py-2.5 text-sm`}>
                  {savingService ? "Guardando..." : "Agregar servicio"}
                </button>
              </form>
            </div>
          </>
        )}

        {/* HORARIO */}
        {tab === "availability" && (
          <AvailabilityEditor availability={availability} setAvailability={setAvailability} authHeaders={authHeaders} />
        )}

        {/* PERFIL */}
        {tab === "profile" && (
          <div className="space-y-4">
            <ProfileEditor affiliate={affiliate} authHeaders={authHeaders} onSave={(updates) => setAffiliate((prev) => ({ ...prev, ...updates }))} />

            <div className={`${tarjeta} p-5`}>
              <h3 className="font-bold text-azul mb-3">Google Calendar</h3>
              {affiliate?.google_calendar_token ? (
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm text-azul-profundo">
                    <CircleCheck size={18} className="text-[#10B981]" /> Conectado
                  </span>
                  <button
                    onClick={async () => {
                      if (!confirm("¿Desconectar Google Calendar? Tus citas nuevas ya no tendrán enlace de videollamada.")) return;
                      await fetch("/api/booking/calendar/disconnect", { method: "POST", headers: authHeaders() });
                      setAffiliate((prev) => ({ ...prev, google_calendar_token: null, google_calendar_id: null }));
                    }}
                    className="text-xs font-semibold text-[#B91C1C] hover:text-[#7F1D1D]"
                  >
                    Desconectar
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-texto-secundario text-sm mb-3">
                    Conecta tu Google Calendar para que tus eventos bloqueen horarios automáticamente y cada cita tenga su videollamada.
                  </p>
                  <a href="/api/booking/calendar/connect" className={`${btnBorde} inline-block text-sm px-4 py-2`}>
                    Conectar Google Calendar
                  </a>
                </>
              )}
            </div>

            <div className={`${tarjeta} p-5`}>
              <h3 className="font-bold text-azul mb-1">Tu link público</h3>
              <code className="text-celeste-texto text-sm break-all">
                {typeof window !== "undefined" ? window.location.origin : ""}/book/{affiliate?.slug}
              </code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
