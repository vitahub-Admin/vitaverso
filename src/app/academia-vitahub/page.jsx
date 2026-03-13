"use client";
import Banner from "../components/Banner";
import { PlayCircle } from "lucide-react";

const CLASES = [
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

export default function AcademiaVitahubPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=Xnnq8yGFoOs" />

      {/* ── Título ── */}
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

      {/* ── Clases ── */}
      <div className="max-w-[960px] mx-auto px-6 py-7 flex flex-col gap-6">
        {CLASES.map((clase, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">

            {/* Header de clase */}
            <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-gray-50">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 text-[#1b3f7a] mt-0.5">
                <PlayCircle size={16} />
              </div>
              <h2 className="text-base font-bold text-[#1b3f7a] leading-snug">{clase.titulo}</h2>
            </div>

            {/* Video */}
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

            {/* Contenido */}
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
      </div>
    </div>
  );
}