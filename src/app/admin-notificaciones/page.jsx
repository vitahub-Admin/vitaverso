"use client";

import { useState } from "react";
import { Bell, Send } from "lucide-react";

export default function AdminNotificacionesPage() {
  const [title,       setTitle]       = useState("");
  const [body,        setBody]        = useState("");
  const [sending,     setSending]     = useState(false);
  const [feedback,    setFeedback]    = useState(null); // { ok, msg }

  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      setFeedback({ ok: false, msg: "Completá el título y el mensaje." });
      return;
    }

    setSending(true);
    setFeedback(null);

    try {
      const res  = await fetch("/api/admin/notifications/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ title: title.trim(), body: body.trim(), target: "all" }),
      });
      const data = await res.json();

      if (data.ok) {
        setFeedback({ ok: true, msg: "Notificación enviada a todos los afiliados." });
        setTitle("");
        setBody("");
      } else {
        setFeedback({ ok: false, msg: data.error ?? "Error al enviar." });
      }
    } catch {
      setFeedback({ ok: false, msg: "Error de red." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="w-full border-b border-gray-100 bg-white px-6">
        <div className="max-w-[720px] mx-auto py-6 flex items-center gap-3">
          <Bell size={22} className="text-[#1b3f7a]" />
          <div>
            <h1 className="text-2xl font-extrabold text-[#1b3f7a] leading-none">
              Notificaciones
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Enviá un mensaje push a todos los afiliados con la app instalada
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-[720px] mx-auto px-6 py-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-5">

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-700">Título</label>
            <input
              type="text"
              placeholder="Ej: ¡Nueva capacitación disponible!"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={65}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]/30"
            />
            <span className="text-xs text-gray-400 text-right">{title.length}/65</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-700">Mensaje</label>
            <textarea
              placeholder="Escribí el cuerpo de la notificación..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={200}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]/30 resize-none"
            />
            <span className="text-xs text-gray-400 text-right">{body.length}/200</span>
          </div>

          {feedback && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
              feedback.ok
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-600 border border-red-200"
            }`}>
              {feedback.msg}
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={sending}
            className="flex items-center justify-center gap-2 bg-[#1b3f7a] hover:bg-[#2a5298] disabled:opacity-60 text-white font-bold rounded-xl px-6 py-3 text-sm transition-colors"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send size={16} />
                Enviar a todos los afiliados
              </>
            )}
          </button>

        </div>
      </div>
    </div>
  );
}
