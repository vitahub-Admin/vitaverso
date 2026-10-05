"use client";

/**
 * Pantalla de acceso a Vitahub Pro.
 *
 * Es lo primero que ve un profesional, así que trata de parecerse a la
 * herramienta que hay detrás y no a un formulario genérico: el logotipo real,
 * la paleta del armador, y nada de adornos.
 *
 * Tiene dos modos en la misma tarjeta —entrar y recuperar la contraseña— para
 * que quien se olvidó la clave no se vaya a otra página y pierda el hilo.
 */

import { useState } from "react";
import Image from "next/image";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

export default function LoginModal({ onLogin, onRegister }) {
  const [modo, setModo] = useState("login");   // login | recuperar | enviado

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [cargando, setCargando] = useState(false);

  const entrar = async () => {
    if (!email || !password) return setError("Escribe tu correo y tu contraseña");
    setError("");
    setCargando(true);
    const r = await onLogin(email, password);
    if (r?.error) setError(r.error);
    setCargando(false);
  };

  const recuperar = async () => {
    if (!email) return setError("Escribe tu correo");
    setError("");
    setCargando(true);
    try {
      await fetch("/api/affiliate-app/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {}
    // Siempre el mismo resultado, exista o no la cuenta: si dijera "ese correo
    // no está registrado", cualquiera podría averiguar quién es afiliado.
    setCargando(false);
    setModo("enviado");
  };

  const campo =
    "w-full border border-[#D0E4EC] rounded-xl px-3.5 py-3 text-sm text-[#0D2133] " +
    "placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8] " +
    "focus:ring-2 focus:ring-[#1E8FA8]/15 transition-colors";

  const etiqueta = "block text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0D2133]/70 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl border border-[#D0E4EC] w-full max-w-sm overflow-hidden">

        <div className="px-7 pt-7 pb-6">

          {/* ── Recuperación enviada ─────────────────────────────────────── */}
          {modo === "enviado" ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#E6F4F8] flex items-center justify-center mx-auto mb-4">
                <MailCheck size={22} className="text-[#1E8FA8]" />
              </div>
              <h2 className="text-lg font-bold text-[#0D2133]">Revisa tu correo</h2>
              <p className="text-[13px] text-[#5B7A8C] mt-1.5 leading-relaxed">
                Si <span className="font-semibold text-[#0D2133]">{email}</span> tiene una cuenta,
                te llegó un enlace para crear una contraseña nueva.
              </p>
              <button
                onClick={() => { setModo("login"); setPassword(""); }}
                className="mt-6 text-[13px] font-semibold text-[#1E8FA8] hover:text-[#0D2133] transition-colors"
              >
                Volver a iniciar sesión
              </button>
            </div>
          ) : (
            <>
              {/* ── Encabezado ─────────────────────────────────────────────── */}
              {modo === "recuperar" ? (
                <>
                  <button
                    onClick={() => { setModo("login"); setError(""); }}
                    className="flex items-center gap-1.5 text-[13px] text-[#5B7A8C] hover:text-[#0D2133] transition-colors mb-5 group"
                  >
                    <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
                    Volver
                  </button>
                  <h2 className="text-xl font-extrabold text-[#0D2133] tracking-tight">
                    Recuperar contraseña
                  </h2>
                  <p className="text-[13px] text-[#5B7A8C] mt-1 leading-relaxed">
                    Te enviamos un enlace para crear una nueva.
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-6">
                    <Image src="/LOGO.png" alt="Vitahub Pro" width={273} height={80}
                      className="h-9 w-auto" priority />
                  </div>
                  <h2 className="text-xl font-extrabold text-[#0D2133] tracking-tight">
                    Inicia sesión
                  </h2>
                  <p className="text-[13px] text-[#5B7A8C] mt-1">
                    Con tu cuenta de profesional
                  </p>
                </>
              )}

              {/* ── Campos ────────────────────────────────────────────────── */}
              <div className="mt-6 space-y-4">
                <div>
                  <label className={etiqueta}>Correo</label>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (modo === "recuperar" ? recuperar() : entrar())}
                    placeholder="tucorreo@ejemplo.com"
                    className={campo}
                  />
                </div>

                {modo === "login" && (
                  <div>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <label className={`${etiqueta} mb-0`}>Contraseña</label>
                      <button
                        onClick={() => { setModo("recuperar"); setError(""); }}
                        className="text-[11px] font-semibold text-[#1E8FA8] hover:text-[#0D2133] transition-colors"
                      >
                        ¿La olvidaste?
                      </button>
                    </div>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && entrar()}
                      placeholder="••••••••"
                      className={campo}
                    />
                  </div>
                )}

                {error && <p className="text-xs text-red-500 leading-snug">{error}</p>}

                <button
                  onClick={modo === "recuperar" ? recuperar : entrar}
                  disabled={cargando}
                  className="w-full bg-[#0D2133] text-white py-3 rounded-xl font-bold text-sm
                    hover:bg-[#16344f] active:bg-[#0D2133] transition-colors
                    disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {cargando && <Loader2 size={15} className="animate-spin" />}
                  {cargando
                    ? "Un momento…"
                    : modo === "recuperar" ? "Enviar enlace" : "Ingresar"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Registro ──────────────────────────────────────────────────── */}
        {modo === "login" && (
          <div className="px-7 py-4 bg-[#F7F9FB] border-t border-[#EEF3F7] text-center">
            <span className="text-[13px] text-[#5B7A8C]">¿Aún no eres afiliado? </span>
            <button
              onClick={onRegister}
              className="text-[13px] font-bold text-[#1E8FA8] hover:text-[#0D2133] transition-colors"
            >
              Regístrate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
