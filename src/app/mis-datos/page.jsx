// src/app/mis-datos/page.jsx
"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import axios from "axios";
import Banner from "../components/Banner"


const CAMPOS_PUBLICOS = ["nombre", "apellido", "email", "red_social", "clabe", "telefono","ciudad","estado","direccion"];

export default function PerfilAfiliado() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    cargarPerfil();
  }, []);

  const cargarPerfil = async () => {
    try {
      const userId = Cookies.get("customerId");
      if (!userId) {
        setMessage({ 
          type: "error", 
          text: "No hay sesión activa. Por favor, inicia sesión." 
        });
        setLoading(false);
        return;
      }

      // ✅ CON AXIOS
      const response = await axios.get(`/api/affiliates/profile`);
      
      if (response.data.success) {
        setData(response.data.data);
        setForm(response.data.data);
      } else {
        setMessage({ 
          type: "error", 
          text: response.data.message || "Error al cargar datos" 
        });
      }
    } catch (error) {
      console.error("Error cargando perfil:", error);
      
      // Axios da más información del error
      const errorMessage = error.response?.data?.message 
        || error.message 
        || "Error de conexión";
      
      setMessage({ 
        type: "error", 
        text: errorMessage 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateClabe = () => {
    if (!form.clabe) return true;
    return /^[0-9]{18}$/.test(form.clabe);
  };

  const handleSave = async () => {
    // Verificar sesión
    const userId = Cookies.get("customerId");
    if (!userId) {
      setMessage({ 
        type: "error", 
        text: "Sesión expirada. Por favor, recarga la página." 
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    // Validar CLABE
    if (!validateClabe()) {
      setSaving(false);
      setMessage({
        type: "error",
        text: "La CLABE debe tener exactamente 18 dígitos numéricos.",
      });
      return;
    }

    try {
      // Preparar cambios
      const cambios = {};
      CAMPOS_PUBLICOS.forEach(key => {
        if (key !== "email" && form[key] !== data[key]) {
          cambios[key] = form[key];
        }
      });

      if (Object.keys(cambios).length === 0) {
        setSaving(false);
        setMessage({ 
          type: "info", 
          text: "No hay cambios para guardar" 
        });
        return;
      }

      // ✅ CON AXIOS
      const response = await axios.patch(`/api/affiliates/profile`, {
        updates: cambios
      });

      if (response.data.success) {
        setMessage({ 
          type: "success", 
          text: response.data.message || "Cambios guardados correctamente" 
        });
        setData(response.data.data);
        setForm(response.data.data);
      } else {
        setMessage({ 
          type: "error", 
          text: response.data.message || "Error al guardar" 
        });
      }
    } catch (error) {
      console.error("Error guardando perfil:", error);
      
      // Manejo de errores más detallado con axios
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || "Error de conexión";
      
      setMessage({ 
        type: "error", 
        text: errorMessage 
      });
    } finally {
      setSaving(false);
    }
  };

  // Estados de carga
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1b3f7a] mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando perfil...</p>
        </div>
      </div>
    );
  }

  if (!data && message?.type === 'error') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{message.text}</p>
          <button 
            onClick={cargarPerfil}
            className="mt-2 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-gray-600">No se encontraron datos del perfil.</p>
      </div>
    );
  }

  const dataFiltrada = Object.fromEntries(
    Object.entries(form).filter(([key]) => CAMPOS_PUBLICOS.includes(key))
  );

  return (

      <div className="flex flex-col items-center gap-6 p-4">
           <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=xh8LTPTXEWE" />
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 flex flex-col md:flex-row md:justify-between gap-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato">Mis datos de Afiliado</h1>
        <button 
          onClick={cargarPerfil}
          className="px-4 py-2 bg-white/20 text-white rounded hover:bg-white/30 transition"
        >
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6 px-6 max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-xl p-6 border">
          {message && (
            <div
              className={`p-3 mb-4 rounded ${
                message.type === "success"
                  ? "bg-green-100 text-green-700 border border-green-200"
                  : message.type === "error"
                  ? "bg-red-100 text-red-700 border border-red-200"
                  : message.type === "info"
                  ? "bg-blue-100 text-blue-700 border border-blue-200"
                  : "bg-gray-100 text-gray-700"
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
                  className={`mt-1 w-full border p-3 rounded-lg transition ${
                    key === "email" 
                      ? "bg-gray-50 cursor-not-allowed text-gray-600" 
                      : "bg-white hover:border-gray-300 focus:border-[#1b3f7a] focus:ring-2 focus:ring-[#1b3f7a]/20"
                  }`}
                  placeholder={`Ingresa tu ${key.replace('_', ' ')}`}
                />
                {key === "email" && (
                  <p className="text-xs text-gray-500 mt-1">
                    El email no se puede modificar.
                  </p>
                )}
                {key === "clabe" && (
                  <p className="text-xs text-gray-500 mt-1">
                    18 dígitos. Ejemplo: 012180000118359719
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-6 px-6 py-3 bg-[#1b3f7a] text-white rounded-lg shadow hover:bg-[#153363] disabled:opacity-50 disabled:cursor-not-allowed transition font-medium w-full flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <span className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                Guardando...
              </>
            ) : 'Guardar cambios'}
          </button>
        </div>

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