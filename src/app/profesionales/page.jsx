// Landing pública para profesionales que todavía no usan Vitahub Pro.
// La abre cualquiera (por ejemplo, el "Invita a tu nutri" de la app Mi Vitahub),
// así que no habla de comisiones ni de ganancias: solo de lo que la plataforma
// le resuelve en la consulta. El registro vive en la tienda.
import Link from "next/link";
import {
  ClipboardList, Users, Package, BadgeCheck, Tag, CalendarDays, Smartphone, ArrowRight, Check,
} from "lucide-react";

export const metadata = {
  title: "Vitahub Pro — Para profesionales de la salud",
  description:
    "Arma protocolos de suplementación, da seguimiento a tus pacientes y recomienda entre más de 2,000 suplementos originales al mejor precio.",
};

const REGISTRO = "https://vitahub.mx/pages/registro-afiliados";

const FUNCIONES = [
  {
    Icon: ClipboardList,
    titulo: "Protocolos en minutos",
    texto:
      "Arma el protocolo de tu paciente con dosis, momento de toma e indicaciones. Se lo compartes con un link y recibe también su receta en PDF.",
  },
  {
    Icon: Users,
    titulo: "Seguimiento de pacientes",
    texto:
      "Ve qué compró cada paciente y cuándo se le termina su suplemento, para acompañarlo en su tratamiento sin perderle la pista.",
  },
  {
    Icon: Package,
    titulo: "Más de 2,000 suplementos",
    texto:
      "Un catálogo amplio de marcas y presentaciones para elegir exactamente lo que tu paciente necesita.",
  },
  {
    Icon: BadgeCheck,
    titulo: "Productos originales",
    texto: "Todo el catálogo es 100% original. Tu paciente toma exactamente lo que le indicaste.",
  },
  {
    Icon: Tag,
    titulo: "El mejor precio",
    texto: "Precios competitivos para que el costo no sea la razón por la que tu paciente deja el tratamiento.",
  },
  {
    Icon: CalendarDays,
    titulo: "Agenda en línea",
    texto: "Tus pacientes reservan su consulta desde tu página, con tus horarios.",
  },
];

const PASOS = [
  { titulo: "Regístrate", texto: "Crea tu cuenta de profesional en unos minutos." },
  { titulo: "Arma el protocolo", texto: "Elige los suplementos, la dosis y cuándo tomarlos." },
  { titulo: "Tu paciente lo recibe", texto: "Lo compra con un clic y lo sigue en la app Mi Vitahub." },
];

function BotonRegistro({ className = "" }) {
  return (
    <a
      href={REGISTRO}
      className={`inline-flex items-center justify-center gap-2 bg-[#1b3f7a] hover:bg-[#162D60] text-white font-bold text-base px-7 py-3.5 rounded-xl transition-colors ${className}`}
    >
      Quiero registrarme <ArrowRight size={18} />
    </a>
  );
}

export default function ProfesionalesPage() {
  return (
    <div className="min-h-screen bg-white text-[#1b3f7a]">
      {/* Encabezado */}
      <header className="border-b border-[#EEF3F7]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <img src="/LOGO.png" alt="Vitahub Pro" className="h-9 w-auto" />
          <a href={REGISTRO} className="text-sm font-bold text-[#1F8383] hover:text-[#1b3f7a] transition-colors">
            Registrarme
          </a>
        </div>
      </header>

      {/* Portada */}
      <section className="bg-[#F7F9FB]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#1F8383] mb-4">
            Para nutriólogos y profesionales de la salud
          </p>
          <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight tracking-tight max-w-3xl mx-auto">
            Tus protocolos de suplementación, en un solo lugar
          </h1>
          <p className="mt-5 text-base sm:text-lg text-[#5B7A8C] leading-relaxed max-w-2xl mx-auto">
            Indica los suplementos de tu paciente, dale seguimiento a su tratamiento y recomienda entre más de
            2,000 productos originales al mejor precio.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <BotonRegistro />
            <a
              href="#como-funciona"
              className="inline-flex items-center justify-center font-bold text-base px-7 py-3.5 rounded-xl border border-[#D0E4EC] bg-white hover:border-[#2BB9B8] transition-colors"
            >
              Cómo funciona
            </a>
          </div>

          <dl className="mt-14 grid grid-cols-3 gap-3 max-w-2xl mx-auto">
            {[
              ["+2,000", "suplementos"],
              ["100%", "originales"],
              ["Mejor", "precio"],
            ].map(([dato, etiqueta]) => (
              <div key={etiqueta} className="bg-white border border-[#D0E4EC] rounded-2xl py-5 px-2">
                <dt className="text-2xl sm:text-3xl font-extrabold tabular-nums">{dato}</dt>
                <dd className="mt-1 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">
                  {etiqueta}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Qué incluye */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-center">Todo lo que necesitas en tu consulta</h2>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FUNCIONES.map(({ Icon, titulo, texto }) => (
            <div key={titulo} className="border border-[#D0E4EC] rounded-2xl p-5">
              <div className="w-10 h-10 rounded-xl bg-[#EAF8F8] flex items-center justify-center mb-4">
                <Icon size={20} className="text-[#1F8383]" />
              </div>
              <h3 className="font-bold">{titulo}</h3>
              <p className="mt-1.5 text-sm text-[#5B7A8C] leading-relaxed">{texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* App del paciente */}
      <section className="bg-[#1b3f7a] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-16 grid sm:grid-cols-[auto_1fr] gap-6 items-center">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
            <Smartphone size={28} className="text-[#2BB9B8]" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold">Tu paciente no se queda solo</h2>
            <p className="mt-2 text-[#C9D8E8] leading-relaxed max-w-2xl">
              Con la app Mi Vitahub ve su protocolo, recibe recordatorios para cada toma y un aviso antes de que se le
              termine un suplemento. Así cumple el tratamiento que le indicaste.
            </p>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20 scroll-mt-4">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-center">Cómo funciona</h2>
        <ol className="mt-10 grid sm:grid-cols-3 gap-4">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="bg-[#F7F9FB] rounded-2xl p-5">
              <span className="w-8 h-8 rounded-full bg-[#2BB9B8] text-[#0D2133] font-extrabold text-sm flex items-center justify-center tabular-nums">
                {i + 1}
              </span>
              <h3 className="mt-4 font-bold">{p.titulo}</h3>
              <p className="mt-1 text-sm text-[#5B7A8C] leading-relaxed">{p.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Cierre */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-20">
        <div className="max-w-3xl mx-auto bg-[#EAF8F8] border border-[#B5E7E6] rounded-3xl px-6 py-10 sm:px-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold">Súmate a Vitahub Pro</h2>
          <ul className="mt-5 inline-flex flex-col gap-2 text-left text-[#1b3f7a]">
            {["Protocolos y seguimiento de pacientes", "Más de 2,000 suplementos originales", "Agenda en línea para tus pacientes"].map((t) => (
              <li key={t} className="flex items-center gap-2 text-sm sm:text-base">
                <Check size={18} className="text-[#1F8383] shrink-0" /> {t}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <BotonRegistro className="w-full sm:w-auto" />
          </div>
        </div>
      </section>

      <footer className="border-t border-[#EEF3F7] py-6 px-4 text-center text-xs text-[#5B7A8C] flex flex-col sm:flex-row gap-2 justify-center items-center">
        <span>© 2026 Vitahub México</span>
        <span className="hidden sm:inline">·</span>
        <Link href="/privacidad" className="hover:text-[#1b3f7a]">Política de Privacidad</Link>
        <span className="hidden sm:inline">·</span>
        <Link href="/terminos" className="hover:text-[#1b3f7a]">Términos y Condiciones</Link>
      </footer>
    </div>
  );
}
