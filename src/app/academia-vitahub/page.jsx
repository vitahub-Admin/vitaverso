"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Banner from "../components/Banner";
import {
  PlayCircle, ChevronLeft, ChevronRight,
  X, Clock, Calendar as CalIcon, CheckCircle2, ExternalLink,
} from "lucide-react";

// ─── Datos de clases ───────────────────────────────────────────────────────────

const CLASES = [
  {
    titulo: "Dra. Noelia Correa Pampillon — Vitamina D: Más allá del déficit",
    embedId: "HwNeRwXBGFQ",
    intro: "Una base clínica sólida para comprender la Vitamina D como una hormona esteroidea inmunometabólica esencial para la regulación de genes y el sistema inmunológico, evitando un enfoque simplista.",
    puntos: [
      "La Vitamina D como hormona: su origen en el colesterol y la dependencia crítica del magnesio para su activación en hígado y riñones.",
      "Interpretación de rangos: por qué 30 ng/mL solo garantiza salud ósea y por qué el rango óptimo funcional debe ser de 47 ng/mL.",
      "El rol de la Paratormona (PTH): cómo usarla como marcador para identificar la resistencia a la vitamina D y la falta de activación en los tejidos.",
      "Funciones pleiotrópicas: su impacto en la prevención cardiovascular, enfermedades autoinmunes, salud mental (depresión) y como agente antiproliferativo en cáncer.",
      "Sinergia con Vitamina K2: la importancia de combinar suplementos para dirigir el calcio al hueso y evitar la calcificación de tejidos blandos.",
      "Optimización de la síntesis endógena: protocolos de exposición solar (20-30 min) y factores que bloquean su producción como la edad, obesidad y protectores solares.",
      "Importancia de la salud intestinal: cómo la hipoclorhidria y la inflamación del colon afectan la capacidad absortiva antes de suplementar.",
      "Errores frecuentes: suplementar sin medir niveles previos, el riesgo de desensibilizar receptores y la falta de reevaluación clínica periódica.",
    ],
    cierre: "El foco final: usar la vitamina D como un modulador biológico sistémico para facilitar la autorregulación del organismo, no solo como una intervención para los huesos.",
  },
  {
    titulo: "Dra. Noelia Correa Pampillon — Suplementación inteligente desde el abordaje PINE",
    embedId: "FFsgaoN_Yz8",
    intro: "Una base clínica sólida para indicar suplementación de forma racional, personalizada y sistémica, evitando la polisuplementación y el enfoque simplista de síntoma = suplemento.",
    puntos: [
      "Qué significa hoy la suplementación ortomolecular (más allá del concepto original de Linus Pauling).",
      "Cómo integrar el modelo PINE (psico-neuro-inmuno-endocrino) en la toma de decisiones.",
      "Diferencias entre suplementación correctiva, preventiva y moduladora de procesos.",
      "Rol central de la mitocondria, inflamación crónica de bajo grado y estrés oxidativo.",
      "Importancia del eje intestino-cerebro, microbiota y capacidad absortiva antes de suplementar.",
      "Regulación neuroendocrina, ritmos circadianos, cortisol/melatonina y carga psicoemocional.",
      "Uso de biomarcadores funcionales por tendencias y contexto metabólico (no solo rango normal).",
      "Errores frecuentes: sobredosis, interacciones, cronificación de suplementos y falta de reevaluación.",
    ],
    cierre: "El foco final: usar el suplemento como puente adaptativo para facilitar la autorregulación del organismo, no como intervención aislada ni permanente.",
  },
  {
    titulo: "Capacitación Blife — Formulación, combinaciones y protocolos de suplementación",
    embedId: "HW1yPbM4vBc",
    intro: "Accedés a una capacitación profunda sobre suplementación funcional aplicada. Eduardo Ortega (My Live Live) recorre los principales suplementos y sus aplicaciones específicas.",
    puntos: [
      "Magnesio y sus formas: aplicaciones en sueño, estrés, músculo y tránsito intestinal.",
      "Omega 3, Krill y grasas funcionales: absorción, inflamación y salud cardiovascular.",
      "Soporte hormonal: femenino (Myo + D-Chiro Inositol) y masculino (Mens Platinum).",
      "Antioxidantes avanzados: Resveratrol, glutatión, astaxantina.",
      "Probióticos y salud intestinal con tecnología de liberación controlada.",
      "Vitaminas liposolubles (D3 + K2): rol en huesos, sistema inmune y energía.",
    ],
    cierre: "Módulo pensado para profesionales que quieren ordenar, profesionalizar y escalar su forma de recomendar suplementos dentro del ecosistema Vitahub.",
  },
  {
    titulo: "Biodisponibilidad de Suplementos — Formación WOHL / Vidalabs",
    embedId: "MgH1_DmxGvE",
    intro: "Oscar Castañeda (Grupo Celeos – Vidalabs / WOHL) desarrolla una mirada integral sobre por qué la biodisponibilidad define si un suplemento funciona o no.",
    puntos: [
      "Diferencias reales entre formas de magnesio, rol de la microbiota en la absorción, y ejemplos con cúrcuma, curcumina y tetrahidrocurcumina.",
      "Uso de ingredientes patentados y bases grasas para mejorar absorción, analizando calidad, precio y efectividad.",
      "Productos de Vidalabs disponibles en Vitahub, con foco en alta concentración, alta absorción y uso clínico.",
    ],
    cierre: "Contenido para profesionales que buscan salir del suplemento genérico, fortalecer su criterio clínico y ofrecer recomendaciones realmente efectivas.",
  },
  {
    titulo: "Bhavani — Suplementos Naturales para tu Bienestar",
    embedId: "3G90B0J00Uw",
    intro: "Fórmulas seguras con ingredientes de origen natural y respaldo científico para mantener energía, concentración y equilibrio diario.",
    puntos: [
      "Bienestar integral: equilibrio físico y emocional.",
      "Apoyo en la menopausia: reduce sofocos y cambios de ánimo.",
      "Concentración y energía: combate la fatiga y mejora la atención.",
      "Ingredientes naturales: fórmulas seguras y responsables.",
    ],
    cierre: "Recomendamos siempre usar los suplementos bajo supervisión de un profesional de la salud, especialmente en embarazo, lactancia o enfermedades autoinmunes.",
  },
  {
    titulo: "Cellx — Salud celular y longevidad",
    embedId: "fJhSET3Mxvw",
    intro: "Suplementos nutracéuticos clínicamente desarrollados para optimizar la salud celular. Sus fórmulas actúan sobre la mitocondria, la epigenética y los mecanismos de reparación celular.",
    puntos: [
      "Salud celular integral: mitocondrias, epigenética y reparación con enfoque clínico.",
      "Prevención de enfermedades crónicas: aplicaciones en diabetes, cardiovasculares, SOP y cáncer.",
      "Formulación avanzada: tecnologías como delivery liposomal y cofactores que mejoran biodisponibilidad.",
      "Uso profesional: diseñados para acompañar protocolos médicos y optimizar la calidad de vida del paciente.",
    ],
    cierre: "Se subrayó la importancia de la prescripción responsable y la integración del producto dentro de planes clínicos personalizados.",
  },
];

// ─── Helpers calendario ────────────────────────────────────────────────────────

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_ES   = ["D","L","M","X","J","V","S"];

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y, m)    { return new Date(y, m, 1).getDay(); }

function fmtTime(s)     { return s ? s.slice(0, 5) + " hrs" : ""; }
function fmtDateLong(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${parseInt(d)} de ${MONTHS_ES[parseInt(m) - 1]} de ${y}`;
}

// ─── Calendario compacto ───────────────────────────────────────────────────────

function CompactCalendar({ events, onDayClick }) {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const byDate = {};
  for (const ev of events) {
    if (!byDate[ev.event_date]) byDate[ev.event_date] = [];
    byDate[ev.event_date].push(ev);
  }

  function prev() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }

  const cells = [];
  for (let i = 0; i < getFirstDay(year, month); i++) cells.push(null);
  for (let d = 1; d <= getDaysInMonth(year, month); d++) cells.push(d);

  function dateKey(d) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const isToday = d =>
    d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      {/* Navegación mes */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} className="p-1 rounded-lg hover:bg-gray-100 transition">
          <ChevronLeft size={15} className="text-gray-500" />
        </button>
        <span className="text-sm font-bold text-[#1b3f7a]">
          {MONTHS_ES[month]} {year}
        </span>
        <button onClick={next} className="p-1 rounded-lg hover:bg-gray-100 transition">
          <ChevronRight size={15} className="text-gray-500" />
        </button>
      </div>

      {/* Cabecera días */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAYS_ES.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const key      = dateKey(day);
          const hasEvent = !!byDate[key];

          return (
            <button
              key={idx}
              disabled={!hasEvent}
              onClick={() => hasEvent && onDayClick(byDate[key])}
              className={`
                flex flex-col items-center justify-center min-h-[36px] rounded-lg transition
                ${hasEvent
                  ? "cursor-pointer hover:bg-[#1b3f7a]/10 hover:ring-1 hover:ring-[#1b3f7a]/20"
                  : "cursor-default"}
                ${isToday(day) ? "ring-1 ring-[#2BB9B8]" : ""}
              `}
            >
              <span className={`text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full
                ${isToday(day)  ? "bg-[#1b3f7a] text-white" :
                  hasEvent      ? "text-[#1b3f7a]"           : "text-gray-400"}`}>
                {day}
              </span>
              {hasEvent && <span className="w-1 h-1 rounded-full bg-[#2BB9B8] mt-0.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Modal evento ──────────────────────────────────────────────────────────────

function EventModal({ events, inscripciones, onClose, onInscribirse }) {
  const [selected,    setSelected]    = useState(events.length === 1 ? events[0] : null);
  const [inscribing,  setInscribing]  = useState(false);
  const [localInscr,  setLocalInscr]  = useState(new Set(inscripciones));

  async function handleInscribirse(ev) {
    setInscribing(true);
    try {
      const res  = await fetch("/api/capacitaciones/inscripciones", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ capacitacion_id: ev.id }),
      });
      const data = await res.json();
      if (data.success) {
        setLocalInscr(prev => new Set([...prev, ev.id]));
        onInscribirse(ev.id);
      }
    } finally {
      setInscribing(false);
    }
  }

  // Vista detalle de un evento
  if (selected) {
    const isInscripto = localInscr.has(selected.id);
    return (
      <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        {events.length > 1 && (
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-4 pt-4 transition"
          >
            <ChevronLeft size={13} /> Volver
          </button>
        )}
        {selected.image_url && (
          <div className="relative w-full h-48">
            <Image src={selected.image_url} alt={selected.title} fill className="object-cover" sizes="400px" />
          </div>
        )}
        <div className="p-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="text-base font-bold text-[#1b3f7a] leading-tight">{selected.title}</h3>
            <button onClick={onClose} className="shrink-0 p-1 rounded-lg hover:bg-gray-100 transition">
              <X size={15} className="text-gray-400" />
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
            <span className="flex items-center gap-1.5">
              <CalIcon size={11} /> {fmtDateLong(selected.event_date)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={11} /> {fmtTime(selected.event_time)}
            </span>
          </div>
          {selected.description && (
            <p className="text-sm text-gray-600 leading-relaxed mb-4 whitespace-pre-line">
              {selected.description}
            </p>
          )}

          {/* Botón inscripción */}
          {isInscripto ? (
            <div className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500/10
              text-emerald-600 text-sm font-semibold rounded-xl border border-emerald-200 cursor-default select-none">
              <CheckCircle2 size={15} /> Ya estás inscripto
            </div>
          ) : (
            <button
              onClick={() => handleInscribirse(selected)}
              disabled={inscribing}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1b3f7a]
                text-white text-sm font-semibold rounded-xl hover:bg-[#163264] transition disabled:opacity-60"
            >
              {inscribing ? "Guardando..." : "Anótate"}
            </button>
          )}

          {/* Link externo (secundario) */}
          {selected.link && isInscripto && (
            <a
              href={selected.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 text-xs
                text-gray-400 hover:text-[#1b3f7a] transition"
            >
              <ExternalLink size={11} /> Ver link del evento
            </a>
          )}
        </div>
      </div>
    );
  }

  // Vista lista (múltiples eventos mismo día)
  return (
    <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl">
      <div className="flex items-center justify-between p-5 pb-3">
        <h3 className="text-base font-bold text-[#1b3f7a]">{events.length} eventos este día</h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition">
          <X size={15} className="text-gray-400" />
        </button>
      </div>
      <div className="flex flex-col gap-2 px-5 pb-5">
        {events.map(ev => (
          <button
            key={ev.id}
            onClick={() => setSelected(ev)}
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-100
              hover:border-[#1b3f7a]/20 hover:bg-[#1b3f7a]/5 transition text-left w-full"
          >
            <div className="w-9 h-9 rounded-lg bg-gray-100 shrink-0 overflow-hidden relative">
              {ev.image_url
                ? <Image src={ev.image_url} alt={ev.title} fill className="object-cover" sizes="36px" />
                : <div className="w-full h-full flex items-center justify-center text-gray-300"><CalIcon size={14} /></div>
              }
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 truncate">{ev.title}</p>
              <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                <Clock size={9} /> {fmtTime(ev.event_time)}
                {localInscr.has(ev.id) && <span className="text-emerald-500 ml-1">✓ Inscripto</span>}
              </p>
            </div>
            <ChevronRight size={13} className="text-gray-300 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

const SHOW_CALENDAR = true;

export default function AcademiaVitahubPage() {
  const [events,       setEvents]       = useState([]);
  const [inscripciones, setInscripciones] = useState(new Set());
  const [modal,        setModal]        = useState(null); // array de eventos del día

  useEffect(() => {
    Promise.all([
      fetch("/api/capacitaciones").then(r => r.json()),
      fetch("/api/capacitaciones/inscripciones").then(r => r.json()),
    ]).then(([evData, inData]) => {
      if (evData.success) setEvents(evData.data);
      if (inData.success) setInscripciones(new Set(inData.inscripciones));
    });
  }, []);

  function handleInscribirse(id) {
    setInscripciones(prev => new Set([...prev, id]));
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=Xnnq8yGFoOs" />

      {/* Título */}
      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[960px] mx-auto py-6">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
            Academia Vitahub
          </h1>
          <p className="text-sm text-gray-400 font-medium">
            Capacitaciones exclusivas para profesionales y afiliados
          </p>
        </div>
      </div>

      <div className="max-w-[960px] mx-auto px-6 py-7 flex flex-col gap-8">

        {/* ── Calendario de próximas capacitaciones ── */}
        {SHOW_CALENDAR && events.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-3 flex items-center gap-2">
              <CalIcon size={13} /> Próximas capacitaciones en vivo
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CompactCalendar events={events} onDayClick={setModal} />

              {/* Instrucciones */}
              <div className="bg-gradient-to-br from-[#1b3f7a]/5 to-[#2BB9B8]/5
                border border-[#1b3f7a]/10 rounded-2xl p-5 flex flex-col justify-center gap-3">
                <p className="text-sm font-bold text-[#1b3f7a]">
                  Capacitaciones en vivo
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Hacé click en los días marcados del calendario para ver los detalles del evento e inscribirte.
                </p>
                <ul className="flex flex-col gap-2 text-xs text-gray-500">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#2BB9B8] shrink-0" />
                    Los días con el punto teal tienen una capacitación programada
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#1b3f7a] shrink-0" />
                    El día resaltado es el día de hoy
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                    Una vez inscripto, verás la confirmación dentro del evento
                  </li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* ── Clases grabadas ── */}
        <section className="flex flex-col gap-6">
          {CLASES.map((clase, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-gray-50">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 text-[#1b3f7a] mt-0.5">
                  <PlayCircle size={16} />
                </div>
                <h2 className="text-base font-bold text-[#1b3f7a] leading-snug">{clase.titulo}</h2>
              </div>
              <div className="px-6 pt-5">
                <div className="w-full rounded-xl overflow-hidden aspect-video bg-gray-100">
                  <iframe
                    src={`https://www.youtube.com/embed/${clase.embedId}`}
                    title={clase.titulo}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div>
              </div>
              <div className="px-6 py-5 flex flex-col gap-4">
                <p className="text-sm text-gray-600 leading-relaxed">{clase.intro}</p>
                <div>
                  <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400 mb-2">
                    Contenidos
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {clase.puntos.map((punto, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1b3f7a] shrink-0 mt-2 opacity-50" />
                        <span dangerouslySetInnerHTML={{ __html: punto }} />
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-gray-400 italic border-t border-gray-50 pt-3">
                  {clase.cierre}
                </p>
              </div>
            </div>
          ))}
        </section>

      </div>

      {/* Modal */}
      {SHOW_CALENDAR && modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null); }}
        >
          <EventModal
            events={modal}
            inscripciones={inscripciones}
            onClose={() => setModal(null)}
            onInscribirse={handleInscribirse}
          />
        </div>
      )}
    </div>
  );
}
