"use client";

import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#1b3f7a] flex flex-col">

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center py-20">
        <div className="mb-8">
          <img src="/logo.png" alt="Vitahub Pro" className="h-16 mx-auto mb-4" onError={e => e.target.style.display='none'} />
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Vitahub Pro
          </h1>
          <p className="mt-3 text-blue-200 text-lg font-medium">
            La plataforma para especialistas afiliados de Vitahub
          </p>
        </div>

        <p className="text-blue-100 max-w-md text-base leading-relaxed mb-10">
          Gestioná tus comisiones, agenda de citas, contactos y accedé a capacitaciones
          exclusivas — todo en un solo lugar.
        </p>

        <Link
          href="/wallet"
          className="inline-block bg-white text-[#1b3f7a] font-bold text-base px-8 py-3.5 rounded-xl shadow-lg hover:bg-blue-50 transition-colors"
        >
          Iniciar sesión
        </Link>

        {/* Features */}
        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl w-full">
          {[
            { icon: "💰", label: "Wallet de comisiones" },
            { icon: "📅", label: "Agenda de citas" },
            { icon: "🛒", label: "Carritos compartidos" },
            { icon: "🎓", label: "Capacitaciones" },
          ].map(f => (
            <div key={f.label} className="bg-white/10 rounded-xl p-4 text-center">
              <div className="text-2xl mb-2">{f.icon}</div>
              <p className="text-white text-xs font-medium leading-snug">{f.label}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-blue-300 text-xs flex flex-col sm:flex-row gap-2 justify-center items-center px-4">
        <span>© 2026 Vitahub México</span>
        <span className="hidden sm:inline">·</span>
        <Link href="/privacidad" className="hover:text-white transition-colors">Política de Privacidad</Link>
        <span className="hidden sm:inline">·</span>
        <Link href="/terminos" className="hover:text-white transition-colors">Términos y Condiciones</Link>
        <span className="hidden sm:inline">·</span>
        <Link href="/soporte" className="hover:text-white transition-colors">Soporte</Link>
      </footer>

    </div>
  );
}
