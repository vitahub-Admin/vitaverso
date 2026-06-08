"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

const STEPS = { SERVICE: 0, DATE: 1, TIME: 2, FORM: 3 };

export default function BookingPage() {
  const { slug } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get("embed") === "1";
  const preselectedServiceId = searchParams.get("service_id");

  const [affiliate, setAffiliate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(STEPS.SERVICE);

  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/booking/affiliate?slug=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setAffiliate(data);
        if (preselectedServiceId) {
          const svc = (data.booking_services || []).find((s) => String(s.id) === preselectedServiceId);
          if (svc) { setSelectedService(svc); setStep(STEPS.DATE); }
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!selectedDate || !selectedService) return;
    setSlotsLoading(true);
    setSlots([]);
    setSelectedTime(null);
    fetch(
      `/api/booking/slots?slug=${slug}&date=${selectedDate}&service_id=${selectedService.id}`
    )
      .then((r) => r.json())
      .then((data) => setSlots(data.slots || []))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, selectedService, slug]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.email) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/booking/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        service_id: selectedService.id,
        date: selectedDate,
        time: selectedTime,
        client_name: form.name,
        client_email: form.email,
        client_phone: form.phone,
        client_notes: form.notes,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (data.checkout_url) {
      if (isEmbed) {
        window.parent.postMessage({ type: "vhb-checkout", url: data.checkout_url }, "*");
      } else {
        window.location.href = data.checkout_url;
      }
    } else {
      setError(data.error || "Error al procesar la reserva");
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Cargando...</div>
      </div>
    );
  }

  if (error && !affiliate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const services = affiliate?.booking_services || [];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">

        {/* Header del afiliado */}
        <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm flex gap-4 items-center">
          {affiliate.photo_url && (
            <img
              src={affiliate.photo_url}
              alt={affiliate.display_name}
              className="w-16 h-16 rounded-full object-cover flex-shrink-0"
            />
          )}
          <div>
            <h1 className="font-semibold text-gray-900 text-lg">{affiliate.display_name}</h1>
            {affiliate.specialty && (
              <p className="text-blue-600 text-sm">{affiliate.specialty}</p>
            )}
            {affiliate.bio && (
              <p className="text-gray-500 text-sm mt-1">{affiliate.bio}</p>
            )}
          </div>
        </div>

        {/* Steps indicator */}
        <div className="flex gap-2 mb-6">
          {["Servicio", "Fecha", "Hora", "Datos"].map((label, i) => (
            <button
              key={i}
              disabled={i >= step}
              onClick={() => i < step && setStep(i)}
              className={`flex-1 text-center text-xs py-1 rounded-full font-medium transition-colors ${
                i === step
                  ? "bg-blue-600 text-white cursor-default"
                  : i < step
                  ? "bg-blue-100 text-blue-600 hover:bg-blue-200 cursor-pointer"
                  : "bg-gray-100 text-gray-400 cursor-default"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Step 0: Elegir servicio */}
        {step === STEPS.SERVICE && (
          <div className="space-y-3">
            <h2 className="text-gray-700 font-medium text-sm mb-4">¿Qué servicio necesitás?</h2>
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelectedService(s); setStep(STEPS.DATE); }}
                className="w-full bg-white rounded-xl p-4 shadow-sm text-left hover:ring-2 hover:ring-blue-500 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900">{s.name}</p>
                    {s.description && (
                      <p className="text-gray-500 text-sm mt-0.5">{s.description}</p>
                    )}
                    <p className="text-gray-400 text-xs mt-1">{s.duration_minutes} min</p>
                  </div>
                  <p className="font-semibold text-gray-900 text-sm ml-4 flex-shrink-0">
                    ${Number(s.price).toLocaleString("es-MX")} {s.currency}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 1: Elegir fecha */}
        {step === STEPS.DATE && (() => {
          const { year, month } = calendarMonth;
          const firstDay = new Date(year, month, 1).getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const maxDate = new Date(today);
          maxDate.setDate(today.getDate() + 90);
          const monthStart = new Date(year, month, 1);
          const canGoPrev = monthStart > today;
          const canGoNext = monthStart < new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
          const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

          return (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setStep(STEPS.SERVICE)} className="text-gray-400 hover:text-gray-600 text-sm">← Volver</button>
                <h2 className="text-gray-700 font-medium text-sm flex-1">Elegí una fecha</h2>
              </div>

              {/* Navegación de mes */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setCalendarMonth(({ year: y, month: m }) => m === 0 ? { year: y - 1, month: 11 } : { year: y, month: m - 1 })}
                  disabled={!canGoPrev}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default text-gray-600"
                >‹</button>
                <span className="font-semibold text-gray-800 text-sm">
                  {MONTHS[month]} {year}
                </span>
                <button
                  onClick={() => setCalendarMonth(({ year: y, month: m }) => m === 11 ? { year: y + 1, month: 0 } : { year: y, month: m + 1 })}
                  disabled={!canGoNext}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default text-gray-600"
                >›</button>
              </div>

              {/* Días de semana */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Do","Lu","Ma","Mi","Ju","Vi","Sa"].map((d) => (
                  <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
                ))}
              </div>

              {/* Grilla del mes */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const dayNum = i + 1;
                  const date = new Date(year, month, dayNum);
                  const dateStr = `${year}-${String(month + 1).padStart(2,"0")}-${String(dayNum).padStart(2,"0")}`;
                  const isPast = date < today;
                  const isTooFar = date > maxDate;
                  const isDisabled = isPast || isTooFar;
                  const isSelected = dateStr === selectedDate;
                  const isToday = date.toDateString() === today.toDateString();

                  return (
                    <button
                      key={dayNum}
                      disabled={isDisabled}
                      onClick={() => { setSelectedDate(dateStr); setStep(STEPS.TIME); }}
                      className={`relative rounded-full aspect-square flex items-center justify-center text-sm font-medium transition-colors
                        ${isSelected ? "bg-blue-600 text-white" : ""}
                        ${!isSelected && isToday ? "text-blue-600 font-bold" : ""}
                        ${!isSelected && !isDisabled ? "hover:bg-blue-50 text-gray-800" : ""}
                        ${isDisabled ? "text-gray-300 cursor-default" : "cursor-pointer"}
                      `}
                    >
                      {isToday && !isSelected && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-600 rounded-full" />
                      )}
                      {dayNum}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Step 2: Elegir hora */}
        {step === STEPS.TIME && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setStep(STEPS.DATE)} className="text-gray-400 hover:text-gray-600 text-sm">← Volver</button>
              <h2 className="text-gray-700 font-medium text-sm">
                Horarios disponibles —{" "}
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("es-MX", {
                  weekday: "long", day: "numeric", month: "long",
                })}
              </h2>
            </div>
            {slotsLoading && (
              <p className="text-gray-400 text-sm text-center py-8">Cargando horarios...</p>
            )}
            {!slotsLoading && slots.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">No hay horarios disponibles para este día.</p>
                <button onClick={() => setStep(STEPS.DATE)} className="mt-3 text-blue-600 text-sm">Elegir otra fecha</button>
              </div>
            )}
            {!slotsLoading && slots.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {slots.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setSelectedTime(t); setStep(STEPS.FORM); }}
                    className="bg-white rounded-xl py-3 text-sm font-medium text-gray-700 shadow-sm hover:ring-2 hover:ring-blue-500 transition-all"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Datos del cliente */}
        {step === STEPS.FORM && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setStep(STEPS.TIME)} className="text-gray-400 hover:text-gray-600 text-sm">← Volver</button>
              <h2 className="text-gray-700 font-medium text-sm">Tus datos</h2>
            </div>

            {/* Resumen de la reserva */}
            <div className="bg-blue-50 rounded-xl p-4 mb-4 text-sm text-blue-800">
              <p className="font-medium">{selectedService?.name}</p>
              <p>
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("es-MX", {
                  weekday: "long", day: "numeric", month: "long",
                })}{" "}
                a las {selectedTime}hs
              </p>
              <p className="font-semibold mt-1">
                ${Number(selectedService?.price).toLocaleString("es-MX")} {selectedService?.currency}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nombre completo *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Tu nombre"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Email *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="tu@email.com"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Teléfono</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+52 55 0000 0000"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nota para el especialista</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="¿Hay algo que el especialista deba saber?"
                />
              </div>

              {error && <p className="text-red-500 text-xs">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 text-white rounded-xl py-4 font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {submitting ? "Procesando..." : "Confirmar y Pagar"}
              </button>
              <p className="text-center text-xs text-gray-400">
                Serás redirigido al checkout seguro de Vitahub para completar el pago.
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
