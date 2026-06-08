"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const FULL_DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

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
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <p className="text-sm text-gray-500 mb-4">
        Definí tu horario semanal. Los turnos disponibles se generan automáticamente
        según la duración de cada servicio.
      </p>

      <div className="space-y-3">
        {FULL_DAYS.map((dayName, i) => (
          <div key={i} className="border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => toggleDay(i)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                    schedule[i] !== null ? "bg-blue-600" : "bg-gray-200"
                  }`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    schedule[i] !== null ? "translate-x-5" : "translate-x-0.5"
                  }`} />
                </div>
                <span className="text-sm font-medium text-gray-700">{dayName}</span>
              </label>
              {schedule[i] !== null && (
                <button
                  onClick={() => addSlot(i)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  + Agregar franja
                </button>
              )}
            </div>

            {schedule[i] === null ? (
              <p className="text-xs text-gray-300 ml-12">No disponible</p>
            ) : (
              <div className="space-y-2 ml-12">
                {schedule[i].map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={slot.start}
                      onChange={(e) => updateSlot(i, idx, "start", e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="text-gray-400 text-sm">–</span>
                    <select
                      value={slot.end}
                      onChange={(e) => updateSlot(i, idx, "end", e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {schedule[i].length > 1 && (
                      <button
                        onClick={() => removeSlot(i, idx)}
                        className="text-gray-300 hover:text-red-400 text-sm ml-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white rounded-xl px-6 py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar horario"}
        </button>
        {saved && <span className="text-green-600 text-sm">✓ Guardado</span>}
        {error && <span className="text-red-500 text-sm">{error}</span>}
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

export default function BookingDashboard() {
  const params = useSearchParams();
  const calendarStatus = params.get("calendar");
  const calendarError = params.get("error");

  const [affiliate, setAffiliate] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("agenda"); // agenda | services | availability | profile

  // Setup modal
  const [showSetup, setShowSetup] = useState(false);
  const [setup, setSetup] = useState({ bio: "" });
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState(null);

  // Nueva cita / servicio
  const [newService, setNewService] = useState({ name: "", duration_minutes: 60, price: "", description: "" });
  const [savingService, setSavingService] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const headers = authHeaders();

    const [affRes, apptRes, svcRes, availRes] = await Promise.all([
      fetch("/api/booking/affiliate", { headers }).then((r) => r.json()).catch(() => null),
      fetch("/api/booking/appointments", { headers }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/booking/services", { headers }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/booking/availability", { headers }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]);

    if (affRes && !affRes.error) setAffiliate(affRes);
    else setShowSetup(true);

    setAppointments(apptRes?.data || []);
    setServices(svcRes?.data || []);
    setAvailability(availRes?.data || []);
    setLoading(false);
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

  async function handleDeleteService(id) {
    await fetch(`/api/booking/services?id=${id}`, { method: "DELETE", headers: authHeaders() });
    setServices((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleCancelAppointment(id) {
    await fetch(`/api/booking/appointments?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status: "cancelled" }),
    });
    setAppointments((prev) => prev.map((a) => a.id === id ? { ...a, status: "cancelled" } : a));
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Setup modal (primera vez) */}
      {showSetup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="font-semibold text-gray-900 text-lg mb-1">Activá tu página de booking</h2>
            <p className="text-gray-500 text-sm mb-4">
              Tu nombre, especialidad y foto se cargan automáticamente desde tu perfil de Vitahub.
            </p>
            <form onSubmit={handleSetup} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Descripción para tus clientes (opcional)</label>
                <textarea rows={3}
                  placeholder="Ej: Especialista en nutrición deportiva con 10 años de experiencia..."
                  value={setup.bio}
                  onChange={(e) => setSetup({ ...setup, bio: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <button type="submit" disabled={setupSaving}
                className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-60">
                {setupSaving ? "Activando..." : "Activar mi página de booking"}
              </button>
              {setupError && <p className="text-red-500 text-xs text-center">{setupError}</p>}
            </form>
          </div>
        </div>
      )}

      {/* Banner: conectar Google Calendar */}
      {affiliate && !affiliate.google_calendar_token && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <span className="text-xl flex-shrink-0">📅</span>
            <div className="flex-1 min-w-0">
              <p className="text-amber-800 font-semibold text-sm">Conectá Google Calendar para activar la experiencia completa</p>
              <p className="text-amber-700 text-xs mt-0.5">
                Sin Calendar: tus clientes <strong>no reciben invitación</strong> ni link de Meet en el email de confirmación.
                Con Calendar: todo queda agendado automáticamente con videollamada incluida.
              </p>
            </div>
            <a
              href="/api/booking/calendar/connect"
              className="flex-shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg px-4 py-2 transition-colors whitespace-nowrap"
            >
              Conectar ahora
            </a>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-gray-900">{affiliate?.display_name || "Booking Dashboard"}</h1>
            {affiliate?.slug && (
              <a href={`/book/${affiliate.slug}`} target="_blank" rel="noopener"
                className="text-xs text-blue-600 hover:underline">
                /book/{affiliate.slug} ↗
              </a>
            )}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/book/${affiliate?.slug}`);
            }}
            className="bg-blue-600 text-white text-xs rounded-lg px-3 py-2 hover:bg-blue-700 transition-colors"
          >
            Copiar link
          </button>
        </div>
      </div>

      {/* Notificaciones */}
      {calendarStatus === "connected" && (
        <div className="max-w-2xl mx-auto mt-4 px-4">
          <div className="bg-green-50 text-green-700 text-sm rounded-xl px-4 py-3">
            Google Calendar conectado correctamente.
          </div>
        </div>
      )}
      {calendarError && (
        <div className="max-w-2xl mx-auto mt-4 px-4">
          <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">
            Error al conectar Google Calendar. Intentá de nuevo.
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-2xl mx-auto px-4 mt-4">
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm">
          {[
            { key: "agenda", label: "Agenda" },
            { key: "services", label: "Servicios" },
            { key: "availability", label: "Horario" },
            { key: "profile", label: "Perfil" },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors ${
                tab === t.key ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* AGENDA */}
        {tab === "agenda" && (
          <>
            {appointments.length === 0 && (
              <div className="bg-white rounded-xl p-8 text-center text-gray-400 text-sm shadow-sm">
                No tenés citas todavía. Compartí tu link para empezar a recibir reservas.
              </div>
            )}
            {appointments.map((a) => (
              <div key={a.id} className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${
                a.status === "confirmed" ? "border-green-400" :
                a.status === "cancelled" ? "border-gray-200 opacity-60" :
                a.status === "completed" ? "border-blue-300" :
                "border-yellow-400"
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{a.client_name}</p>
                    <p className="text-gray-500 text-xs">{a.client_email}</p>
                    {a.client_phone && <p className="text-gray-500 text-xs">{a.client_phone}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    a.status === "confirmed" ? "bg-green-100 text-green-700" :
                    a.status === "cancelled" ? "bg-gray-100 text-gray-500" :
                    a.status === "completed" ? "bg-blue-100 text-blue-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {a.status === "confirmed" ? "Confirmada" :
                     a.status === "cancelled" ? "Cancelada" :
                     a.status === "completed" ? "Completada" : "Pendiente"}
                  </span>
                </div>
                <p className="text-gray-700 text-sm mt-2">
                  {a.booking_services?.name} —{" "}
                  {new Date(a.starts_at).toLocaleDateString("es-MX", {
                    weekday: "short", day: "numeric", month: "short",
                  })}{" "}
                  {new Date(a.starts_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}hs
                </p>
                {a.client_notes && (
                  <p className="text-gray-400 text-xs mt-1 italic">"{a.client_notes}"</p>
                )}
                {a.status === "confirmed" && (
                  <button onClick={() => handleCancelAppointment(a.id)}
                    className="mt-2 text-xs text-red-500 hover:text-red-700">
                    Cancelar cita
                  </button>
                )}
              </div>
            ))}
          </>
        )}

        {/* SERVICIOS */}
        {tab === "services" && (
          <>
            {services.filter((s) => s.is_active).map((s) => (
              <div key={s.id} className="bg-white rounded-xl p-4 shadow-sm flex justify-between items-start">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{s.name}</p>
                  {s.description && <p className="text-gray-500 text-xs mt-0.5">{s.description}</p>}
                  <p className="text-gray-400 text-xs mt-1">{s.duration_minutes} min</p>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="font-semibold text-gray-900 text-sm">${Number(s.price).toLocaleString("es-MX")}</p>
                  <button onClick={() => handleDeleteService(s.id)}
                    className="text-xs text-red-400 hover:text-red-600 mt-1">
                    Eliminar
                  </button>
                </div>
              </div>
            ))}

            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-medium text-gray-900 text-sm mb-3">Agregar servicio</h3>
              <form onSubmit={handleAddService} className="space-y-2">
                <input required placeholder="Nombre del servicio" value={newService.name}
                  onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input placeholder="Descripción (opcional)" value={newService.description}
                  onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <div className="flex gap-2">
                  <input required type="number" placeholder="Duración (min)" value={newService.duration_minutes}
                    onChange={(e) => setNewService({ ...newService, duration_minutes: e.target.value })}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input required type="number" placeholder="Precio (MXN)" value={newService.price}
                    onChange={(e) => setNewService({ ...newService, price: e.target.value })}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button type="submit" disabled={savingService}
                  className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60">
                  {savingService ? "Guardando..." : "Agregar servicio"}
                </button>
              </form>
            </div>
          </>
        )}

        {/* HORARIO */}
        {tab === "availability" && (
          <AvailabilityEditor
            availability={availability}
            setAvailability={setAvailability}
            authHeaders={authHeaders}
          />
        )}

        {/* PERFIL */}
        {tab === "profile" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-medium text-gray-900 text-sm mb-3">Google Calendar</h3>
              {affiliate?.google_calendar_token ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="text-sm text-gray-700">Conectado</span>
                </div>
              ) : (
                <>
                  <p className="text-gray-500 text-xs mb-3">
                    Conectá tu Google Calendar para que tus eventos bloqueen slots automáticamente.
                  </p>
                  <a href="/api/booking/calendar/connect"
                    className="inline-block bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors shadow-sm">
                    Conectar Google Calendar
                  </a>
                </>
              )}
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-medium text-gray-900 text-sm mb-1">Tu link público</h3>
              <code className="text-blue-600 text-sm">
                {typeof window !== "undefined" ? window.location.origin : ""}/book/{affiliate?.slug}
              </code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
