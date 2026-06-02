"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Banner from "../components/Banner";
import {
  PlayCircle, Clock, Calendar as CalIcon,
  CheckCircle2, ExternalLink, Hourglass,
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function fmtTime(s)     { return s ? s.slice(0, 5) + " hrs" : ""; }
function fmtDateLong(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${parseInt(d)} de ${MONTHS_ES[parseInt(m) - 1]}`;
}

// ─── Card de evento ────────────────────────────────────────────────────────────

function EventCard({ event, status: initialStatus, onInscribirse }) {
  const [inscribing, setInscribing] = useState(false);
  const [status,     setStatus]     = useState(initialStatus); // null | "pendiente" | "inscrito"

  async function handleInscribirse() {
    setInscribing(true);
    try {
      const res  = await fetch("/api/capacitaciones/inscripciones", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ capacitacion_id: event.id }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("pendiente");
        onInscribirse(event.id);
        if (event.link) window.open(event.link, "_blank");
      }
    } finally {
      setInscribing(false);
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {event.image_url ? (
        <div className="relative aspect-video w-full">
          <Image src={event.image_url} alt={event.title} fill className="object-cover" sizes="400px" />
        </div>
      ) : (
        <div className="aspect-video w-full bg-[#1b3f7a]/5 flex items-center justify-center">
          <CalIcon size={28} className="text-[#1b3f7a]/20" />
        </div>
      )}

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
          <span className="flex items-center gap-1">
            <CalIcon size={11} /> {fmtDateLong(event.event_date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} /> {fmtTime(event.event_time)}
          </span>
        </div>

        <p className="text-sm font-bold text-gray-800 leading-snug">{event.title}</p>

        {event.description && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{event.description}</p>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-1">
          {status === "inscrito" ? (
            <div className="flex items-center justify-center gap-2 py-2.5 bg-emerald-50
              text-emerald-600 text-sm font-semibold rounded-xl border border-emerald-200 cursor-default">
              <CheckCircle2 size={14} /> Ya estás inscrito
            </div>
          ) : status === "pendiente" ? (
            <div className="flex items-center justify-center gap-2 py-2.5 bg-amber-50
              text-amber-600 text-sm font-semibold rounded-xl border border-amber-200 cursor-default">
              <Hourglass size={14} /> Pendiente de confirmación
            </div>
          ) : (
            <button
              onClick={handleInscribirse}
              disabled={inscribing}
              className="py-2.5 bg-[#1b3f7a] text-white text-sm font-semibold rounded-xl
                hover:bg-[#163264] disabled:opacity-60 transition"
            >
              {inscribing ? "Guardando..." : "Anótate"}
            </button>
          )}
          {event.link && status && (
            <a
              href={event.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-xs text-gray-400
                hover:text-[#1b3f7a] transition"
            >
              <ExternalLink size={11} /> Ver link del evento
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function AcademiaVitahubPage() {
  const [events,        setEvents]        = useState([]);
  const [inscripciones, setInscripciones] = useState({}); // { [id]: "pendiente" | "inscrito" }

  useEffect(() => {
    Promise.all([
      fetch("/api/capacitaciones").then(r => r.json()),
      fetch("/api/capacitaciones/inscripciones").then(r => r.json()),
    ]).then(([evData, inData]) => {
      if (evData.success) setEvents(evData.data);
      if (inData.success) {
        const map = {};
        for (const i of inData.inscripciones) map[i.id] = i.status;
        setInscripciones(map);
      }
    });
  }, []);

  function handleInscribirse(id) {
    setInscripciones(prev => ({ ...prev, [id]: "pendiente" }));
  }

  const today    = new Date().toISOString().split("T")[0];
  const upcoming = events
    .filter(e => e.event_date >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=Xnnq8yGFoOs" />

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

        {/* ── Próximas capacitaciones en vivo ── */}
        {upcoming.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-4 flex items-center gap-2">
              <CalIcon size={13} /> Próximas capacitaciones en vivo
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {upcoming.map(ev => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  status={inscripciones[ev.id] || null}
                  onInscribirse={handleInscribirse}
                />
              ))}
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
    </div>
  );
}
