"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Banner from "../components/Banner.jsx";
import {
  Trash2, Plus, ChevronLeft, ChevronRight,
  Calendar as CalIcon, Loader2, Pencil, X,
} from "lucide-react";

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_ES   = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y, m)    { return new Date(y, m, 1).getDay(); }

function MiniCalendar({ events }) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const eventDates = new Set(
    events
      .filter(e => {
        const d = new Date(e.event_date + "T12:00:00");
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .map(e => parseInt(e.event_date.split("-")[2]))
  );

  function prev() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }

  const cells = [];
  for (let i = 0; i < getFirstDay(year, month); i++) cells.push(null);
  for (let d = 1; d <= getDaysInMonth(year, month); d++) cells.push(d);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sticky top-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} className="p-1 rounded-lg hover:bg-gray-100 transition"><ChevronLeft size={15} /></button>
        <span className="text-xs font-semibold text-gray-600">{MONTHS_ES[month]} {year}</span>
        <button onClick={next} className="p-1 rounded-lg hover:bg-gray-100 transition"><ChevronRight size={15} /></button>
      </div>
      <div className="grid grid-cols-7 gap-px text-center mb-1">
        {DAYS_ES.map(d => (
          <div key={d} className="text-[9px] font-semibold text-gray-400 py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px text-center">
        {cells.map((day, i) => {
          const isToday = day && day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
          return (
            <div key={i} className="flex flex-col items-center py-1">
              <span className={`text-[11px] w-6 h-6 flex items-center justify-center rounded-full
                ${isToday ? "bg-[#1b3f7a] text-white font-bold" : "text-gray-500"}`}>
                {day || ""}
              </span>
              {day && eventDates.has(day) && (
                <span className="w-1 h-1 rounded-full bg-[#2BB9B8] mt-0.5" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtDate(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}
function fmtTime(s) {
  return s ? s.slice(0, 5) + " hrs" : "";
}

export default function AdminCapacitacionesPage() {
  const [events,     setEvents]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState(null);
  const [editingId,  setEditingId]  = useState(null);
  const [form, setForm] = useState({
    title: "", description: "", event_date: "", event_time: "", image_url: "", link: "",
  });

  const EMPTY_FORM = { title: "", description: "", event_date: "", event_time: "", image_url: "", link: "" };

  function startEdit(ev) {
    setEditingId(ev.id);
    setForm({
      title:      ev.title       || "",
      description:ev.description || "",
      event_date: ev.event_date  || "",
      event_time: ev.event_time  || "",
      image_url:  ev.image_url   || "",
      link:       ev.link        || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function showToast(msg, type = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function loadEvents() {
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/capacitaciones");
      const data = await res.json();
      if (data.success) setEvents(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEvents(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const isEdit = !!editingId;
      const res = await fetch(
        isEdit ? `/api/admin/capacitaciones/${editingId}` : "/api/admin/capacitaciones",
        {
          method:  isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(form),
        }
      );
      const data = await res.json();
      if (data.success) {
        if (isEdit) {
          setEvents(prev => prev.map(ev => ev.id === editingId ? data.data : ev));
          showToast("Cambios guardados ✅");
          cancelEdit();
        } else {
          setEvents(prev => [data.data, ...prev]);
          setForm(EMPTY_FORM);
          showToast("Capacitación creada ✅");
        }
      } else {
        showToast(data.error || "Error al guardar", "err");
      }
    } catch {
      showToast("Error de conexión", "err");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar esta capacitación?")) return;
    try {
      const res  = await fetch(`/api/admin/capacitaciones/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setEvents(prev => prev.filter(ev => ev.id !== id));
        showToast("Eliminada ✅");
      } else {
        showToast("Error al eliminar", "err");
      }
    } catch {
      showToast("Error de conexión", "err");
    }
  }

  const field = "border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]/30 bg-white";

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Banner />

      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[1100px] mx-auto py-6">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
            Capacitaciones
          </h1>
          <p className="text-sm text-gray-400 font-medium">
            Gestión de eventos y capacitaciones para afiliados 
          </p>
        </div>
      </div>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold text-white
          ${toast.type === "err" ? "bg-red-500" : "bg-emerald-500"}`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-[1100px] mx-auto px-6 py-7 flex flex-col gap-6">

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-gradient-to-br from-[#1b3f7a]/5 to-[#2BB9B8]/5 border border-[#1b3f7a]/10 rounded-2xl p-5"
        >
          <h2 className="text-sm font-bold text-[#1b3f7a] mb-4 flex items-center gap-2">
            {editingId ? <><Pencil size={15} /> Editar capacitación</> : <><Plus size={15} /> Nueva capacitación</>}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              placeholder="Título *"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className={`sm:col-span-2 ${field}`}
            />
            <input
              required
              type="date"
              value={form.event_date}
              onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
              className={field}
            />
            <input
              required
              type="time"
              value={form.event_time}
              onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))}
              className={field}
            />
            <input
              placeholder="URL de imagen"
              value={form.image_url}
              onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
              className={field}
            />
            <input
              placeholder="Link para unirse"
              value={form.link}
              onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
              className={field}
            />
            <textarea
              placeholder="Descripción / información del evento"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className={`sm:col-span-2 resize-none ${field}`}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-[#1b3f7a] text-white text-sm font-semibold rounded-xl
                hover:bg-[#163264] disabled:opacity-60 flex items-center gap-2 transition"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : editingId ? <Pencil size={14} /> : <Plus size={14} />}
              {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear capacitación"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-200
                  text-gray-500 hover:bg-gray-50 flex items-center gap-2 transition"
              >
                <X size={14} /> Cancelar
              </button>
            )}
          </div>
        </form>

        {/* List + Calendar */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 items-start">

          {/* Event list */}
          <div>
            <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-3 flex items-center gap-2">
              <CalIcon size={13} /> Todas las capacitaciones
            </h2>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-[#1b3f7a]" />
              </div>
            ) : events.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-12">
                No hay capacitaciones cargadas aún.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {events.map(ev => (
                  <div
                    key={ev.id}
                    className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3 shadow-sm hover:border-gray-200 transition"
                  >
                    <div className="w-12 h-12 rounded-lg bg-gray-100 shrink-0 overflow-hidden relative">
                      {ev.image_url ? (
                        <Image src={ev.image_url} alt={ev.title} fill className="object-cover" sizes="48px" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <CalIcon size={20} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{ev.title}</p>
                      <p className="text-xs text-gray-400">{fmtDate(ev.event_date)} · {fmtTime(ev.event_time)}</p>
                    </div>
                    <button
                      onClick={() => startEdit(ev)}
                      className="p-1.5 rounded-lg text-[#1b3f7a] hover:bg-[#1b3f7a]/10 transition shrink-0"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(ev.id)}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mini calendar — desktop only */}
          <div className="hidden lg:block">
            <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-3 flex items-center gap-2">
              <CalIcon size={13} /> Calendario
            </h2>
            <MiniCalendar events={events} />
          </div>

        </div>
      </div>
    </div>
  );
}
