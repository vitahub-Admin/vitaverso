"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Banner from "../components/Banner.jsx";
import { ChevronLeft, ChevronRight, X, ExternalLink, Calendar as CalIcon, Clock } from "lucide-react";

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_ES   = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y, m)    { return new Date(y, m, 1).getDay(); }

function fmtTime(s) { return s ? s.slice(0, 5) + " hrs" : ""; }
function fmtDateLong(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${parseInt(d)} de ${MONTHS_ES[parseInt(m) - 1]} de ${y}`;
}

export default function CapacitacionesPage() {
  const today = new Date();
  const [year,       setYear]       = useState(today.getFullYear());
  const [month,      setMonth]      = useState(today.getMonth());
  const [events,     setEvents]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [modal,      setModal]      = useState(null); // array of events for the clicked day

  useEffect(() => {
    fetch("/api/capacitaciones")
      .then(r => r.json())
      .then(data => { if (data.success) setEvents(data.data); })
      .finally(() => setLoading(false));
  }, []);

  // Group by YYYY-MM-DD
  const byDate = {};
  for (const ev of events) {
    if (!byDate[ev.event_date]) byDate[ev.event_date] = [];
    byDate[ev.event_date].push(ev);
  }

  function prev() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay    = getFirstDay(year, month);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function dateKey(day) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const isToday = d =>
    d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const isPast = d =>
    new Date(year, month, d) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const hasEventsThisMonth = cells.some(d => d && byDate[dateKey(d)]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Banner />

      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[900px] mx-auto py-6">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
            Capacitaciones
          </h1>
          <p className="text-sm text-gray-400 font-medium">
            Próximos eventos y capacitaciones para afiliados
          </p>
        </div>
      </div>

      <div className="max-w-[900px] mx-auto px-6 py-7">

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1b3f7a]" />
          </div>
        ) : (
          <>
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-6">
              <button onClick={prev} className="p-2 rounded-xl hover:bg-gray-100 transition">
                <ChevronLeft size={20} className="text-gray-500" />
              </button>
              <h2 className="text-xl font-bold text-[#1b3f7a]">
                {MONTHS_ES[month]} {year}
              </h2>
              <button onClick={next} className="p-2 rounded-xl hover:bg-gray-100 transition">
                <ChevronRight size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS_ES.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, idx) => {
                if (!day) return <div key={idx} />;

                const key       = dateKey(day);
                const dayEvents = byDate[key] || [];
                const hasEvent  = dayEvents.length > 0;
                const isHovered = hoveredKey === key;
                const colPos    = idx % 7; // 0=Dom … 6=Sáb

                return (
                  <div
                    key={idx}
                    className="relative"
                    onMouseEnter={() => hasEvent && setHoveredKey(key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onClick={() => hasEvent && setModal(dayEvents)}
                  >
                    {/* Day cell */}
                    <div className={`
                      flex flex-col items-center justify-start gap-1
                      min-h-[56px] sm:min-h-[72px] p-1.5 rounded-xl transition-all select-none
                      ${hasEvent ? "cursor-pointer hover:bg-[#1b3f7a]/5" : ""}
                      ${hasEvent && isHovered ? "ring-1 ring-[#1b3f7a]/20" : ""}
                      ${isToday(day) ? "ring-1 ring-[#2BB9B8]" : ""}
                      ${!hasEvent && isPast(day) ? "opacity-25" : ""}
                    `}>
                      <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full
                        ${isToday(day)  ? "bg-[#1b3f7a] text-white" :
                          hasEvent      ? "text-[#1b3f7a]"          : "text-gray-400"}`}>
                        {day}
                      </span>
                      {hasEvent && <span className="w-1.5 h-1.5 rounded-full bg-[#2BB9B8]" />}
                    </div>

                    {/* Hover tooltip — desktop */}
                    {hasEvent && isHovered && (
                      <div className={`
                        hidden sm:block absolute z-20 w-48 bg-white rounded-xl shadow-xl
                        border border-gray-100 overflow-hidden top-full mt-1
                        ${colPos >= 5 ? "right-0" : "left-0"}
                      `}>
                        {dayEvents[0].image_url && (
                          <div className="relative w-full h-24">
                            <Image
                              src={dayEvents[0].image_url}
                              alt={dayEvents[0].title}
                              fill className="object-cover"
                              sizes="192px"
                            />
                          </div>
                        )}
                        <div className="p-2.5">
                          <p className="text-xs font-semibold text-gray-800 leading-snug line-clamp-2">
                            {dayEvents[0].title}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                            <Clock size={10} /> {fmtTime(dayEvents[0].event_time)}
                          </p>
                          {dayEvents.length > 1 && (
                            <p className="text-[10px] text-[#2BB9B8] mt-1 font-medium">
                              +{dayEvents.length - 1} evento{dayEvents.length > 2 ? "s" : ""} más
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!hasEventsThisMonth && (
              <p className="text-center text-gray-400 text-sm mt-10">
                No hay capacitaciones este mes.
              </p>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null); }}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* If multiple events on same day, show list first */}
            {modal.length > 1 ? (
              <MultiEventModal events={modal} onClose={() => setModal(null)} />
            ) : (
              <SingleEventModal event={modal[0]} onClose={() => setModal(null)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SingleEventModal({ event: ev, onClose }) {
  return (
    <>
      {ev.image_url && (
        <div className="relative w-full h-52">
          <Image src={ev.image_url} alt={ev.title} fill className="object-cover" sizes="400px" />
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="text-lg font-bold text-[#1b3f7a] leading-tight">{ev.title}</h3>
          <button onClick={onClose} className="shrink-0 p-1 rounded-lg hover:bg-gray-100 transition">
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
          <span className="flex items-center gap-1.5">
            <CalIcon size={12} />
            {fmtDateLong(ev.event_date)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={12} />
            {fmtTime(ev.event_time)}
          </span>
        </div>
        {ev.description && (
          <p className="text-sm text-gray-600 leading-relaxed mb-4 whitespace-pre-line">
            {ev.description}
          </p>
        )}
        {ev.link && (
          <a
            href={ev.link}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1b3f7a] text-white
              text-sm font-semibold rounded-xl hover:bg-[#163264] transition"
          >
            <ExternalLink size={14} /> Unirse a la capacitación
          </a>
        )}
      </div>
    </>
  );
}

function MultiEventModal({ events, onClose }) {
  const [selected, setSelected] = useState(null);

  if (selected) {
    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-4 pt-4 transition"
        >
          <ChevronLeft size={13} /> Volver
        </button>
        <SingleEventModal event={selected} onClose={onClose} />
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-[#1b3f7a]">
          {events.length} eventos este día
        </h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition">
          <X size={16} className="text-gray-400" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {events.map(ev => (
          <button
            key={ev.id}
            onClick={() => setSelected(ev)}
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-100
              hover:border-[#1b3f7a]/20 hover:bg-[#1b3f7a]/5 transition text-left w-full"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 overflow-hidden relative">
              {ev.image_url ? (
                <Image src={ev.image_url} alt={ev.title} fill className="object-cover" sizes="40px" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <CalIcon size={16} />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{ev.title}</p>
              <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                <Clock size={10} /> {fmtTime(ev.event_time)}
              </p>
            </div>
            <ChevronRight size={14} className="text-gray-300 shrink-0 ml-auto" />
          </button>
        ))}
      </div>
    </div>
  );
}
