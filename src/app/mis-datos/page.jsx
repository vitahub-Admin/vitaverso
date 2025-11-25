"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";

const CAMPOS_PUBLICOS = ["nombre", "apellido", "email", "red_social", "clabe"];

export default function PerfilAfiliado() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const userId = Cookies.get("customerId");
    if (!userId) {
      setLoading(false);
      return;
    }

    fetch(`/api/sheet/${userId}/data-usuarios`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setData(json.data);
          setForm(json.data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateClabe = () => {
    if (!form.clabe) return true;
    return /^[0-9]{18}$/.test(form.clabe);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    if (!validateClabe()) {
      setSaving(false);
      setMessage({
        type: "error",
        text: "La CLABE debe tener exactamente 18 dígitos numéricos.",
      });
      return;
    }

    try {
      const userId = Cookies.get("customerId");

      const res = await fetch(`/api/sheet/${userId}/data-usuarios`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = await res.json();

      if (json.success) {
        setMessage({ type: "success", text: "Cambios guardados correctamente" });
      } else {
        setMessage({ type: "error", text: json.message || "Error al guardar" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    }

    setSaving(false);
  };

  if (loading) return <p>Cargando datos...</p>;
  if (!data) return <p>No se encontraron datos en la sheet</p>;

  const dataFiltrada = Object.fromEntries(
    Object.entries(form).filter(([key]) => CAMPOS_PUBLICOS.includes(key))
  );

  return (
    <div className="w-full">
      {/* ---- Banner superior ---- */}
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 flex flex-col md:flex-row md:justify-between gap-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato">Mis datos de Afiliado</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6 px-6 max-w-6xl mx-auto">

        {/* ---- Card de formulario ---- */}
        <div className="bg-white rounded-xl shadow-xl p-6 border">
          {message && (
            <div
              className={`p-3 mb-4 rounded ${
                message.type === "success"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {Object.entries(dataFiltrada).map(([key, value]) => (
              <div key={key} className="flex flex-col">
                <label className="font-semibold text-[#1b3f7a] mb-1">
                  {key.replace(/_/g, " ").toUpperCase()}
                </label>

                <input
                  type="text"
                  value={form[key] || ""}
                  readOnly={key === "email"}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className={`mt-1 w-full border p-2 rounded-lg shadow-sm ${
                    key === "email" ? "bg-gray-100 cursor-not-allowed" : "bg-white"
                  }`}
                />
                {key === "email" && (
                  <p className="text-xs text-gray-500 mt-1">
                    Tu email no puede modificarse.
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-6 px-6 py-3 bg-[#1b3f7a] text-white rounded-lg shadow hover:bg-[#153363] disabled:opacity-50 w-full"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>

        {/* ---- Card lateral de recordatorio ---- */}
        <div className="bg-white rounded-xl shadow-xl p-6 border h-fit">
          <h2 className="text-2xl font-bold text-[#1b3f7a] mb-3">
            Información Importante
          </h2>

          <p className="text-gray-700 mb-4">
            Esta información nos permite contactarte y mantener tu registro actualizado dentro del programa de afiliados.
          </p>

          <p className="text-gray-700 font-medium">
             La CLABE es <strong>obligatoria</strong> para procesar tus pagos y depositar tus ganancias correctamente.
          </p>

          <p className="text-sm text-gray-500 mt-4">
            Asegúrate de que la CLABE sea correcta; si está mal, el pago será rechazado por el banco.
          </p>
        </div>
      </div>
    </div>
  );
}
