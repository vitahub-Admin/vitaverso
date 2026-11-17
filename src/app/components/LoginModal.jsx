"use client";

/**
 * Pantalla de acceso a Vitahub Pro.
 *
 * Es lo primero que ve un profesional, así que trata de parecerse a la
 * herramienta que hay detrás y no a un formulario genérico: el logotipo real,
 * la paleta del armador, y nada de adornos.
 *
 * Se entra sin contraseña: el correo recibe un código de 6 dígitos (dos pasos en la misma tarjeta).
 */

import { useState, useEffect } from "react";
import Image from "next/image";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function LoginModal({ onLoginCode, onRegister }) {
  // codigo (pedir el código) | verificar (escribirlo)
  const [modo, setModo] = useState("codigo");

  const [email, setEmail]       = useState("");
  const [codigo, setCodigo]     = useState("");
  const [error, setError]       = useState("");
  const [cargando, setCargando] = useState(false);
  const [espera, setEspera]     = useState(0);   // segundos para poder pedir otro código

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const pedirCodigo = async () => {
    if (!email) return setError("Escribe tu correo");
    setError("");
    setCargando(true);
    try {
      const res = await fetch("/api/pro/auth/code/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setCodigo("");
        setEspera(data.cooldown || 60);
        setModo("verificar");
      } else {
        setError(data.error || "No pudimos enviar el código. Intenta de nuevo.");
      }
    } catch {
      setError("Error de conexión");
    }
    setCargando(false);
  };

  const entrarConCodigo = async () => {
    if (codigo.replace(/\D/g, "").length !== 6) return setError("Escribe el código de 6 dígitos");
    setError("");
    setCargando(true);
    const r = await onLoginCode(email.trim(), codigo);
    if (r?.error) setError(r.error);
    setCargando(false);
  };

  const volver = (a) => { setModo(a); setError(""); };

  const campo =
    "w-full border border-[#D0E4EC] rounded-xl px-3.5 py-3 text-sm text-[#0D2133] " +
    "placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#2BB9B8] " +
    "focus:ring-2 focus:ring-[#2BB9B8]/15 transition-colors";

  const etiqueta = "block text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-1.5";

  const botonVolver = (destino) => (
    <button
      onClick={() => volver(destino)}
      className="flex items-center gap-1.5 text-[13px] text-[#5B7A8C] hover:text-[#0D2133] transition-colors mb-5 group"
    >
      <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
      Volver
    </button>
  );

  const botonPrincipal = (texto, accion, textoCargando = "Un momento…") => (
    <button
      onClick={accion}
      disabled={cargando}
      className="w-full bg-[#0D2133] text-white py-3 rounded-xl font-bold text-sm
        hover:bg-[#16344f] active:bg-[#0D2133] transition-colors
        disabled:opacity-50 flex items-center justify-center gap-2"
    >
      {cargando && <Loader2 size={15} className="animate-spin" />}
      {cargando ? textoCargando : texto}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0D2133]/70 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl border border-[#D0E4EC] w-full max-w-sm overflow-hidden">

        <div className="px-7 pt-7 pb-6">

          {modo === "verificar" ? (
            /* ── Escribir el código que llegó ─────────────────────────────── */
            <>
              {botonVolver("codigo")}
              <h2 className="text-xl font-extrabold text-[#0D2133] tracking-tight">Escribe tu código</h2>
              <p className="text-[13px] text-[#5B7A8C] mt-1 leading-relaxed">
                Si <span className="font-semibold text-[#0D2133]">{email}</span> tiene una cuenta,
                te enviamos un código de 6 dígitos. Vence en 15 minutos.
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <label className={etiqueta}>Código</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    autoFocus
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && entrarConCodigo()}
                    placeholder="000000"
                    className={`${campo} text-center text-xl font-bold tracking-[0.5em] tabular-nums`}
                  />
                </div>

                {error && <p className="text-xs text-red-500 leading-snug">{error}</p>}

                {botonPrincipal("Ingresar", entrarConCodigo)}

                <div className="flex items-center justify-between text-[12px]">
                  <button
                    onClick={pedirCodigo}
                    disabled={espera > 0 || cargando}
                    className="font-semibold text-[#1F8383] hover:text-[#0D2133] transition-colors disabled:text-[#8AAAB8] disabled:cursor-not-allowed"
                  >
                    {espera > 0 ? `Reenviar en ${espera} s` : "Reenviar código"}
                  </button>
                  <button
                    onClick={() => volver("codigo")}
                    className="text-[#5B7A8C] hover:text-[#0D2133] transition-colors"
                  >
                    Cambiar correo
                  </button>
                </div>
              </div>
            </>

          ) : (
            <>
              {/* ── Encabezado ─────────────────────────────────────────────── */}
              <div className="mb-6">
                <Image src="/LOGO.png" alt="Vitahub Pro" width={273} height={80}
                  className="h-9 w-auto" priority />
              </div>
              <h2 className="text-xl font-extrabold text-[#0D2133] tracking-tight">
                Inicia sesión
              </h2>
              <p className="text-[13px] text-[#5B7A8C] mt-1 leading-relaxed">
                Escribe el correo de tu cuenta de profesional y te enviamos un código de 6 dígitos. Sin contraseña.
              </p>

              {/* ── Campos ────────────────────────────────────────────────── */}
              <div className="mt-6 space-y-4">
                <div>
                  <label className={etiqueta}>Correo</label>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && pedirCodigo()}
                    placeholder="tucorreo@ejemplo.com"
                    className={campo}
                  />
                </div>

                {error && <p className="text-xs text-red-500 leading-snug">{error}</p>}

                {botonPrincipal("Enviarme el código", pedirCodigo, "Enviando…")}
              </div>
            </>
          )}
        </div>

        {/* ── Registro ──────────────────────────────────────────────────── */}
        {modo === "codigo" && (
          <div className="px-7 py-4 bg-[#F7F9FB] border-t border-[#EEF3F7] text-center">
            <span className="text-[13px] text-[#5B7A8C]">¿Aún no eres afiliado? </span>
            <button
              onClick={onRegister}
              className="text-[13px] font-bold text-[#1F8383] hover:text-[#0D2133] transition-colors"
            >
              Regístrate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
