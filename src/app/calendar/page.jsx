// src/app/admin/calendar/page.jsx
'use client';

import { useEffect, useState } from 'react';
import {
  Calendar,
  Video,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  MinusCircle,
  User,
  Phone,
  MapPin,
  Briefcase,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';

const SOURCE_LABELS = {
  vambe:    { label: 'Vambe',    color: 'bg-purple-100 text-purple-700' },
  calendly: { label: 'Calendly', color: 'bg-blue-100 text-blue-700' },
  manual:   { label: 'Manual',   color: 'bg-gray-100 text-gray-600' },
};

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  });
}

function AttendanceButton({ value, onChange }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onChange(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
          ${value === true
            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
            : 'border-gray-200 text-gray-400 hover:border-emerald-200 hover:text-emerald-600'}`}
      >
        <CheckCircle2 size={13} /> Asistió
      </button>
      <button
        onClick={() => onChange(false)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
          ${value === false
            ? 'bg-red-50 border-red-300 text-red-600'
            : 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500'}`}
      >
        <XCircle size={13} /> No asistió
      </button>
      {value !== null && (
        <button
          onClick={() => onChange(null)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-400 hover:border-gray-300 transition-all"
        >
          <MinusCircle size={13} /> Limpiar
        </button>
      )}
    </div>
  );
}

function InviteeRow({ invitee, onUpdate }) {
  const [attended, setAttended]   = useState(invitee.attended ?? null);
  const [notes, setNotes]         = useState(invitee.notes ?? '');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const affiliate = invitee.affiliates;

  async function handleAttendance(val) {
    setAttended(val);
    await save(val, notes);
  }

  async function save(attendedVal, notesVal) {
    setSaving(true);
    try {
      await fetch(`/api/admin/calendar/invitee/${invitee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attended: attendedVal, notes: notesVal }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onUpdate?.();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/50 flex flex-col gap-3">

      {/* Header invitee */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <User size={14} className="text-[#1b3f7a]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {affiliate
                ? `${affiliate.first_name ?? ''} ${affiliate.last_name ?? ''}`.trim()
                : invitee.name ?? invitee.email}
            </p>
            <p className="text-xs text-gray-400">{invitee.email}</p>
          </div>
        </div>

        {/* Badge asistencia */}
        {attended === true  && <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">✓ Asistió</span>}
        {attended === false && <span className="text-xs font-semibold text-red-500 bg-red-50 border border-red-200 px-2 py-1 rounded-lg">✗ No asistió</span>}
        {attended === null  && <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">Pendiente</span>}
      </div>

      {/* Datos del afiliado si hay match */}
      {affiliate && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {affiliate.phone && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Phone size={11} className="text-gray-400" />
              {affiliate.phone}
            </div>
          )}
          {affiliate.profession && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Briefcase size={11} className="text-gray-400" />
              {affiliate.profession}
            </div>
          )}
          {(affiliate.city || affiliate.state) && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <MapPin size={11} className="text-gray-400" />
              {[affiliate.city, affiliate.state].filter(Boolean).join(', ')}
            </div>
          )}
          {affiliate.vambe_contact_id && (
            <a
              href={`https://app.vambeai.com/pipeline?id=e62197d9-4933-4ad9-87d2-64fe03166ef5&chatContactId=${affiliate.vambe_contact_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-purple-600 hover:underline col-span-2 md:col-span-1"
            >
              <MessageSquare size={11} /> Ver en Vambe
            </a>
          )}
        </div>
      )}

      {/* Asistencia */}
      <div className="flex flex-col gap-2">
        <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">Asistencia</p>
        <AttendanceButton value={attended} onChange={handleAttendance} />
      </div>

      {/* Notas */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">Notas</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Agregar notas sobre esta llamada..."
          rows={2}
          className="w-full text-xs text-gray-700 border border-gray-200 rounded-lg px-3 py-2 resize-none outline-none focus:border-[#1b3f7a] focus:shadow-[0_0_0_3px_rgba(27,63,122,0.08)] transition-all"
        />
        <div className="flex items-center justify-end gap-2">
          {saved && <span className="text-xs text-emerald-500 font-medium">✓ Guardado</span>}
          <button
            onClick={() => save(attended, notes)}
            disabled={saving}
            className="px-4 py-1.5 bg-[#1b3f7a] text-white rounded-lg text-xs font-semibold hover:bg-[#163264] transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar nota'}
          </button>
        </div>
      </div>

    </div>
  );
}

function getCalendarAccent(calendarId) {
  if (!calendarId) return 'bg-white';
  if (calendarId === 'afiliados@vitahub.mx') return 'bg-sky-100';
  if (calendarId.startsWith('c_3c3a720e')) return 'bg-green-100';
  return 'bg-white';
}

function CallCard({ call, onUpdate }) {
  const [open, setOpen] = useState(false);
  const source = SOURCE_LABELS[call.source] ?? SOURCE_LABELS.manual;
  const accentClass = getCalendarAccent(call.calendar_id);

  return (
    <div className={`border border-gray-100 rounded-2xl shadow-sm overflow-hidden ${accentClass}`}>

      {/* Header */}
      <div
        className="flex items-center gap-4 p-5 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {/* Hora */}
        <div className="flex flex-col items-center justify-center w-14 shrink-0">
          <span className="text-lg font-extrabold text-[#1b3f7a] leading-none">
            {formatTime(call.starts_at)}
          </span>
          <span className="text-[0.65rem] text-gray-400 mt-0.5">
            {formatTime(call.ends_at)}
          </span>
        </div>

        <div className="h-10 w-px bg-gray-100 shrink-0" />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-bold text-gray-800 truncate">{call.event_name}</p>
            <span className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded-full ${source.color}`}>
              {source.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
            <span className="flex items-center gap-1">
              <User size={11} />
              {call.scheduled_call_invitees?.length ?? 0} invitado{call.scheduled_call_invitees?.length !== 1 ? 's' : ''}
            </span>
            {call.scheduled_call_invitees?.some(i => i.attended === true) && (
              <span className="flex items-center gap-1 text-emerald-500">
                <CheckCircle2 size={11} />
                {call.scheduled_call_invitees.filter(i => i.attended === true).length} asistió
              </span>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 shrink-0">
          {call.meet_link && (
            <a
              href={call.meet_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#1b3f7a] text-white rounded-lg text-xs font-semibold hover:bg-[#163264] transition-colors"
            >
              <Video size={13} /> Meet
            </a>
          )}
          <ChevronDown
            size={18}
            className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Invitees expandidos */}
      {open && (
        <div className="border-t border-gray-100 p-5 flex flex-col gap-3">
          {call.scheduled_call_invitees?.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Sin invitados registrados</p>
          ) : (
            call.scheduled_call_invitees.map((invitee) => (
              <InviteeRow key={invitee.id} invitee={invitee} onUpdate={onUpdate} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function todayMX() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' }); // YYYY-MM-DD
}

function offsetDate(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr) {
  // dateStr = YYYY-MM-DD
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export default function CalendarPage() {
  const [calls, setCalls]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayMX);

  const isToday = selectedDate === todayMX();

  async function fetchCalls(date = selectedDate) {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/calendar/today?date=${date}`);
      const data = await res.json();
      if (data.success) setCalls(data.data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCalls(selectedDate); }, [selectedDate]);

  function goTo(date) {
    setSelectedDate(date);
  }

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white">
      <div className="w-9 h-9 rounded-full border-[3px] border-gray-200 border-t-[#1b3f7a] animate-spin" />
      <p className="text-sm text-gray-400">Cargando agenda…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* Título */}
      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[960px] mx-auto py-6 flex items-center justify-between">

          {/* Navegación de fecha */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => goTo(offsetDate(selectedDate, -1))}
              className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 hover:border-[#1b3f7a] hover:text-[#1b3f7a] transition-colors"
            >
              <ChevronLeft size={16} />
            </button>

            <div>
              <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
                Agenda{isToday && <span className="ml-2 text-sm font-semibold text-emerald-500">Hoy</span>}
              </h1>
              <p className="text-sm text-gray-400 font-medium capitalize">
                {formatDateLabel(selectedDate)}
              </p>
            </div>

            <button
              onClick={() => goTo(offsetDate(selectedDate, 1))}
              disabled={isToday}
              className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 hover:border-[#1b3f7a] hover:text-[#1b3f7a] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>

            {!isToday && (
              <button
                onClick={() => goTo(todayMX())}
                className="text-xs font-semibold text-[#1b3f7a] hover:underline"
              >
                Volver a hoy
              </button>
            )}
          </div>

          <button
            onClick={() => fetchCalls(selectedDate)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:border-[#1b3f7a] hover:text-[#1b3f7a] transition-colors"
          >
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-[960px] mx-auto px-6 py-7 flex flex-col gap-4">

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Reuniones hoy', value: calls.length, icon: Calendar },
            { label: 'Invitados totales', value: calls.reduce((a, c) => a + (c.scheduled_call_invitees?.length ?? 0), 0), icon: User },
            { label: 'Asistencias confirmadas', value: calls.reduce((a, c) => a + (c.scheduled_call_invitees?.filter(i => i.attended === true).length ?? 0), 0), icon: CheckCircle2 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} className="text-[#1b3f7a]" />
                <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">{label}</p>
              </div>
              <p className="text-2xl font-extrabold text-[#1b3f7a]">{value}</p>
            </div>
          ))}
        </div>

        {/* Lista de calls */}
        {calls.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-300">
            <Calendar size={32} strokeWidth={1.5} />
            <p className="text-sm text-gray-400">No hay reuniones programadas para hoy</p>
          </div>
        ) : (
          calls.map((call) => (
            <CallCard key={call.id} call={call} onUpdate={fetchCalls} />
          ))
        )}

      </div>
    </div>
  );
}