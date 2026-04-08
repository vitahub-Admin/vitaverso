"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import axios from "axios";
import Banner from "../components/Banner";
import { RefreshCw, Info, CreditCard } from "lucide-react";

const CAMPOS_PUBLICOS = ["nombre","apellido","email","red_social","clabe","telefono","ciudad","estado","direccion"];

const LABEL = {
  nombre:     "Nombre",
  apellido:   "Apellido",
  email:      "Email",
  red_social: "Red social",
  clabe:      "CLABE",
  telefono:   "Teléfono",
  ciudad:     "Ciudad",
  estado:     "Estado",
  direccion:  "Dirección",
};

const HINTS = {
  email: "El email no se puede modificar.",
  clabe: "18 dígitos numéricos. Ej: 012180000118359719",
};

export default function PerfilAfiliado() {
  const [data,    setData]    = useState(null);
  const [form,    setForm]    = useState({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => { cargarPerfil(); }, []);

  const cargarPerfil = async () => {
    setLoading(true);
    try {
      const userId = Cookies.get("customerId");
      if (!userId) {
        setMessage({ type: "error", text: "No hay sesión activa. Por favor, iniciá sesión." });
        setLoading(false);
        return;
      }
      const response = await axios.get("/api/affiliates/profile");
      if (response.data.success) {
        setData(response.data.data);
        setForm(response.data.data);
      } else {
        setMessage({ type: "error", text: response.data.message || "Error al cargar datos" });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || error.message || "Error de conexión" });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const validateClabe = () => !form.clabe || /^[0-9]{18}$/.test(form.clabe);

  const handleSave = async () => {
    const userId = Cookies.get("customerId");
    if (!userId) { setMessage({ type: "error", text: "Sesión expirada. Recargá la página." }); return; }

    setSaving(true);
    setMessage(null);

    if (!validateClabe()) {
      setSaving(false);
      setMessage({ type: "error", text: "La CLABE debe tener exactamente 18 dígitos numéricos." });
      return;
    }

    try {
      const cambios = {};
      CAMPOS_PUBLICOS.forEach(key => {
        if (key !== "email" && form[key] !== data[key]) cambios[key] = form[key];
      });

      if (Object.keys(cambios).length === 0) {
        setSaving(false);
        setMessage({ type: "info", text: "No hay cambios para guardar." });
        return;
      }

      const response = await axios.patch("/api/affiliates/profile", { updates: cambios });
      if (response.data.success) {
        setMessage({ type: "success", text: response.data.message || "Cambios guardados correctamente" });
        setData(response.data.data);
        setForm(response.data.data);
      } else {
        setMessage({ type: "error", text: response.data.message || "Error al guardar" });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || error.message || "Error de conexión" });
    } finally {
      setSaving(false);
    }
  };

  // ── Loading ──
  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <div className="w-8 h-8 rounded-full border-[3px] border-gray-200 border-t-[#1b3f7a] animate-spin" />
        <p className="text-sm">Cargando perfil…</p>
      </div>
    </div>
  );

  // ── Error sin datos ──
  if (!data && message?.type === "error") return (
    <div className="min-h-screen bg-white">
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=xh8LTPTXEWE" />
      <div className="max-w-[960px] mx-auto px-6 py-7">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex flex-col gap-3">
          <p className="text-red-600 text-sm">{message.text}</p>
          <button onClick={cargarPerfil}
            className="self-start px-4 py-2 bg-red-100 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-200 transition">
            Reintentar
          </button>
        </div>
      </div>
    </div>
  );

  const dataFiltrada = Object.fromEntries(
    Object.entries(form).filter(([key]) => CAMPOS_PUBLICOS.includes(key))
  );

  const msgStyle = {
    success: "bg-emerald-50 border-emerald-200 text-emerald-700",
    error:   "bg-red-50    border-red-200    text-red-600",
    info:    "bg-blue-50   border-blue-200   text-blue-600",
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=xh8LTPTXEWE" />

      {/* ── Título ── */}
      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[960px] mx-auto py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
              Mis datos de Afiliado
            </h1>
            <p className="text-sm text-gray-400 font-medium">Mantené tu información actualizada</p>
          </div>
          <button onClick={cargarPerfil}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition">
            <RefreshCw size={13} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="max-w-[960px] mx-auto px-6 py-7">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-5">

          {/* ── Formulario ── */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 flex flex-col gap-5">

            {/* Mensaje */}
            {message && (
              <div className={`text-sm px-4 py-3 rounded-xl border ${msgStyle[message.type] || msgStyle.info}`}>
                {message.text}
              </div>
            )}

            {/* Campos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(dataFiltrada).map(([key, value]) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">
                    {LABEL[key] || key.replace(/_/g, " ")}
                  </label>
                  <input
                    type="text"
                    value={form[key] || ""}
                    readOnly={key === "email"}
                    onChange={e => handleChange(key, e.target.value)}
                    placeholder={`Ingresa tu ${LABEL[key]?.toLowerCase() || key}`}
                    className={`border rounded-xl px-3 py-2.5 text-sm outline-none transition ${
                      key === "email"
                        ? "bg-gray-50 text-gray-400 cursor-not-allowed border-gray-100"
                        : "bg-white border-gray-200 focus:border-[#1b3f7a] focus:ring-2 focus:ring-[#1b3f7a]/10"
                    }`}
                  />
                  {HINTS[key] && (
                    <p className="text-[0.68rem] text-gray-400">{HINTS[key]}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Guardar */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-[#1b3f7a] text-white rounded-xl text-sm font-semibold hover:bg-[#163264] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {saving && <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>

          {/* ── Info sidebar ── */}
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1b3f7a] flex items-center justify-center">
                  <Info size={15} />
                </div>
                <p className="text-sm font-bold text-[#1b3f7a]">Información importante</p>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Esta información nos permite contactarte y mantener tu registro actualizado dentro del programa de afiliados.
              </p>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <CreditCard size={15} />
                </div>
                <p className="text-sm font-bold text-gray-700">CLABE bancaria</p>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-2">
                La CLABE es <strong className="text-gray-700">obligatoria</strong> para procesar tus pagos y depositar tus ganancias correctamente.
              </p>
              <p className="text-xs text-gray-400">
                Asegurate de que sea correcta — si está mal, el pago será rechazado por el banco.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}