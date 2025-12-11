"use client";
import { useEffect, useState } from "react";
import { Trash2, ArrowUp, ArrowDown, Plus } from "lucide-react";
import Banner from "../components/Banner";

export default function Admin() {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [banners, setBanners] = useState([]);

  const FALLBACK = { url: "/BANNER.webp", description: "Banner por defecto" };

  // Obtener lista de banners
  const loadBanners = () => {
    fetch("/api/data/banner/list")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) {
          setBanners([FALLBACK]);
        } else {
          setBanners(data);
        }
      })
      .catch(() => {
        setBanners([FALLBACK]);
      });
  };

  useEffect(() => {
    loadBanners();
  }, []);

  // Agregar nuevo banner
  const save = async () => {
    await fetch("/api/data/banner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, description }),
    });

    alert("Banner agregado");
    setUrl("");
    setDescription("");
    loadBanners();
  };

  // Borrar un banner por índice (NO el último)
  const deleteOne = async (index) => {
    let newList = banners.filter((_, i) => i !== index);

    // fallback si quedó vacío
    if (newList.length === 0) newList = [FALLBACK];

    await fetch("/api/data/banner", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banners: newList }),
    });

    loadBanners();
  };

  // Mover arriba
  const moveUp = (index) => {
    if (index === 0) return;
    const updated = [...banners];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setBanners(updated);
  };

  // Mover abajo
  const moveDown = (index) => {
    if (index === banners.length - 1) return;
    const updated = [...banners];
    [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
    setBanners(updated);
  };

  // Guardar nuevo orden
  const saveOrder = async () => {
    await fetch("/api/data/banner", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banners }),
    });

    alert("Orden guardado");
  };

  return (
    <div className="flex flex-col items-center gap-6 p-4">

      <Banner />

      {/* Header */}
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 flex flex-col md:flex-row md:justify-between gap-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato">
          Administrar Banners
        </h1>
      </div>

      {/* Formulario agregar banner */}
      <div style={{ maxWidth: 500, margin: "20px auto" }}>
        <h2 className="mb-2">Agregar Banner</h2>

        <input
          placeholder="URL de la imagen"
          className="w-full p-2 border mb-2"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <input
          placeholder="Descripción"
          className="w-full p-2 border mb-4"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <button
          onClick={save}
          className="px-4 py-2 bg-black text-white rounded flex items-center gap-2 mr-4"
        >
          <Plus size={18} /> Agregar
        </button>
      </div>

      {/* Listado de banners */}
      <div className="w-full max-w-2xl mt-10">
        <h2 className="text-xl mb-4 font-semibold">Lista de Banners</h2>

        <div className="flex flex-col gap-4">
          {banners.map((b, i) => (
            <div
              key={i}
              className="flex items-center justify-between border p-3 rounded shadow-sm"
            >
              <div className="flex items-center gap-4">
                {/* Miniatura */}
                <img
                  src={b.url}
                  alt={b.description}
                  className="w-24 h-12 object-cover rounded"
                />

                <span>{b.description || "(sin descripción)"}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => moveUp(i)}
                  className="p-2 bg-gray-200 rounded"
                >
                  <ArrowUp size={18} />
                </button>

                <button
                  onClick={() => moveDown(i)}
                  className="p-2 bg-gray-200 rounded"
                >
                  <ArrowDown size={18} />
                </button>

                <button
                  onClick={() => deleteOne(i)}
                  className="p-2 bg-red-600 text-white rounded"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Guardar orden */}
        <div className="text-right mt-4">
          <button
            onClick={saveOrder}
            className="px-6 py-2 bg-blue-600 text-white rounded"
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
