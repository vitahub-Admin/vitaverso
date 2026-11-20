"use client";

/**
 * Pantalla de acceso a Vitahub Pro.
 *
 * Es lo primero que ve un profesional, así que trata de parecerse a la
 * herramienta que hay detrás y no a un formulario genérico: el logotipo real,
 * la paleta del armador, y nada de adornos.
 *
 * Tiene varios modos en la misma tarjeta para que nadie se vaya a otra página y
 * pierda el hilo: entrar con contraseña, entrar con un código que llega al correo
 * (sin contraseña) y recuperar la contraseña.
 */

import { useState, useEffect } from "react";
import Image from "next/image";
import { ArrowLeft, Loader2, MailCheck, KeyRound } from "lucide-react";

export default function LoginModal({ onLogin, onLoginCode, onRegister }) {
  // login | recuperar | enviado | codigo | verificar
  const [modo, setModo] = useState("login");

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [codigo, setCodigo]     = useState("");
  const [error, setError]       = useState("");
  const [cargando, setCargando] = useState(false);
  const [espera, setEspera]     = useState(0);   // segundos para poder pedir otro código

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

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

          {/* ── Recuperación enviada ─────────────────────────────────────── */}
          {modo === "enviado" ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#E6F4F8] flex items-center justify-center mx-auto mb-4">
                <MailCheck size={22} className="text-[#1F8383]" />
              </div>
              <h2 className="text-lg font-bold text-[#0D2133]">Revisa tu correo</h2>
              <p className="text-[13px] text-[#5B7A8C] mt-1.5 leading-relaxed">
                Si <span className="font-semibold text-[#0D2133]">{email}</span> tiene una cuenta,
                te llegó un enlace para crear una contraseña nueva.
              </p>
              <button
                onClick={() => { setModo("login"); setPassword(""); }}
                className="mt-6 text-[13px] font-semibold text-[#1F8383] hover:text-[#0D2133] transition-colors"
              >
                Volver a iniciar sesión
              </button>
            </div>

          ) : modo === "verificar" ? (
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
              {modo === "recuperar" ? (
                <>
                  {botonVolver("login")}
                  <h2 className="text-xl font-extrabold text-[#0D2133] tracking-tight">
                    Recuperar contraseña
                  </h2>
                  <p className="text-[13px] text-[#5B7A8C] mt-1 leading-relaxed">
                    Te enviamos un enlace para crear una nueva.
                  </p>
                </>
              ) : modo === "codigo" ? (
                <>
                  {botonVolver("login")}
                  <h2 className="text-xl font-extrabold text-[#0D2133] tracking-tight">
                    Entra con un código
                  </h2>
                  <p className="text-[13px] text-[#5B7A8C] mt-1 leading-relaxed">
                    Sin contraseña: te enviamos 6 dígitos a tu correo.
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
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      (modo === "recuperar" ? recuperar() : modo === "codigo" ? pedirCodigo() : entrar())}
                    placeholder="tucorreo@ejemplo.com"
                    className={campo}
                  />
                </div>

                {modo === "login" && (
                  <div>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <label className={`${etiqueta} mb-0`}>Contraseña</label>
                      <button
                        onClick={() => volver("recuperar")}
                        className="text-[11px] font-semibold text-[#1F8383] hover:text-[#0D2133] transition-colors"
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

                {botonPrincipal(
                  modo === "recuperar" ? "Enviar enlace" : modo === "codigo" ? "Enviarme el código" : "Ingresar",
                  modo === "recuperar" ? recuperar : modo === "codigo" ? pedirCodigo : entrar,
                  modo === "codigo" ? "Enviando…" : "Un momento…"
                )}

                {modo === "login" && (
                  <button
                    onClick={() => volver("codigo")}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#D0E4EC]
                      text-[13px] font-semibold text-[#1B3F7A] hover:border-[#2BB9B8] hover:bg-[#EAF8F8] transition-colors"
                  >
                    <KeyRound size={14} />
                    Entrar con un código por correo
                  </button>
                )}
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
