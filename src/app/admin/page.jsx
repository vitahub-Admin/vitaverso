"use client";
import { useEffect, useState } from "react";
import { Trash2, ArrowUp, ArrowDown, Plus, Eye, EyeOff, Link2 } from "lucide-react";
import Banner from "../components/Banner";

export default function Admin() {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [banners, setBanners] = useState([]);
  const [linkValues, setLinkValues] = useState({});

  const [news, setNews] = useState([]);

const [newsTitulo, setNewsTitulo] = useState("");
const [newsImagen, setNewsImagen] = useState("");
const [newsContenido, setNewsContenido] = useState("");
const [newsFecha, setNewsFecha] = useState("");


  const FALLBACK = { url: "/BANNER.webp", description: "Banner por defecto" };

  // Obtener lista de banners
  const loadBanners = () => {
    fetch("/api/data/banner/list")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) && data.length > 0 ? data : [FALLBACK];
        setBanners(list);
        const map = {};
        for (const b of list) map[b.id] = b.link || "";
        setLinkValues(map);
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
      body: JSON.stringify({ url, description, link }),
    });
    setUrl(""); setDescription(""); setLink("");
    loadBanners();
  };

  // Seleccionar banner activo (desactiva todos los demás)
  const setActiveBanner = async (banner) => {
    if (banner.visible) return; // ya es el activo
    setBanners(prev => prev.map(b => ({ ...b, visible: b.id === banner.id })));
    await fetch("/api/data/banner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: banner.id, visible: true }),
    });
  };

  // Actualizar link inline
  const saveLink = async (banner, newLink) => {
    const res = await fetch("/api/data/banner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: banner.id, link: newLink || null }),
    });
    if (res.ok) {
      setBanners(prev => prev.map(b => b.id === banner.id ? { ...b, link: newLink || null } : b));
    }
  };

  // Borrar un banner por índice (NO el último)
  const deleteOne = async (banner) => {
    if (!confirm("¿Seguro que quieres eliminar este banner?")) return;
  
    try {
      const response = await fetch("/api/data/banner", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: banner.id }), // Siempre usar ID
      });
  
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Error al eliminar");
      }
  
      alert("Banner eliminado");
      loadBanners();
      
    } catch (error) {
      console.error("Error deleting banner:", error);
      alert(`Error: ${error.message}`);
    }
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
    try {
      // Asegurarnos de incluir todos los campos necesarios
      const bannersToSave = banners.map((banner, index) => ({
        id: banner.id,
        url: banner.url,
        description: banner.description || "",
        link: linkValues[banner.id] || null,
        visible: banner.visible !== false,
        display_order: index,
      }));
  
      const response = await fetch("/api/data/banner", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banners: bannersToSave }),
      });
  
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Error al guardar orden");
      }
  
      alert("✅ Orden guardado correctamente");
      
    } catch (error) {
      console.error("Error saving order:", error);
      alert(`❌ Error: ${error.message}`);
    }
  };
  // Cargar noticias
const loadNews = () => {
  fetch("/api/data/news")
    .then((r) => r.json())
    .then((data) => {
      setNews(Array.isArray(data.news) ? data.news : []);
    })
    .catch(() => {
      setNews([]);
    });
};

useEffect(() => {
  loadNews();
}, []);

// Agregar noticia
const saveNews = async () => {
  await fetch("/api/data/news", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      titulo: newsTitulo,
      imagen: newsImagen,
      contenido: newsContenido,
      fecha: newsFecha,
    }),
  });

  setNewsTitulo("");
  setNewsImagen("");
  setNewsContenido("");
  setNewsFecha("");

  loadNews();
};

// Borrar una noticia
const deleteNews = async (id) => {
  await fetch("/api/data/news", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });

  loadNews();
};

// Reordenar
const moveNewsUp = (i) => {
  if (i === 0) return;
  const updated = [...news];
  [updated[i - 1], updated[i]] = [updated[i], updated[i - 1]];
  setNews(updated);
};

const moveNewsDown = (i) => {
  if (i === news.length - 1) return;
  const updated = [...news];
  [updated[i + 1], updated[i]] = [updated[i], updated[i + 1]];
  setNews(updated);
};

// Guardar orden
const saveNewsOrder = async () => {
  await fetch("/api/data/news", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ news }),
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
      <div className="w-full max-w-2xl mt-4">
        <h2 className="text-xl font-semibold mb-3">Agregar Banner</h2>
        <div className="flex flex-col gap-2 p-4 border rounded-xl bg-gray-50">
          <input placeholder="URL de la imagen" className="w-full p-2 border rounded text-sm" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input placeholder="Descripción" className="w-full p-2 border rounded text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
          <input placeholder="Link al hacer clic (opcional)" className="w-full p-2 border rounded text-sm" value={link} onChange={(e) => setLink(e.target.value)} />
          <button onClick={save} className="self-start px-4 py-2 bg-black text-white rounded flex items-center gap-2 text-sm mt-1">
            <Plus size={16} /> Agregar
          </button>
        </div>
      </div>

      {/* Listado de banners */}
      <div className="w-full max-w-2xl mt-6">
        <h2 className="text-xl mb-4 font-semibold">Lista de Banners</h2>

        <div className="flex flex-col gap-3">
          {banners.map((b, i) => (
            <div key={b.id ?? i} className={`flex items-center gap-3 border-2 p-3 rounded-xl shadow-sm transition-all ${b.visible ? 'border-blue-400 bg-blue-50/30' : 'border-gray-100 opacity-50'}`}>
              <img src={b.url} alt={b.description} className="w-20 h-11 object-cover rounded shrink-0" />

              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{b.description || "(sin descripción)"}</span>
                  {b.visible && <span className="text-[0.6rem] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">ACTIVO</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <Link2 size={12} className="text-gray-400 shrink-0" />
                  <input
                    value={linkValues[b.id] ?? ""}
                    onChange={(e) => setLinkValues(prev => ({ ...prev, [b.id]: e.target.value }))}
                    onBlur={(e) => saveLink(b, e.target.value)}
                    placeholder="Sin link"
                    className="text-xs border rounded px-2 py-1 w-full text-gray-600 bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => moveUp(i)} className="p-1.5 bg-gray-100 rounded hover:bg-gray-200"><ArrowUp size={15} /></button>
                <button onClick={() => moveDown(i)} className="p-1.5 bg-gray-100 rounded hover:bg-gray-200"><ArrowDown size={15} /></button>
                <button
                  onClick={() => setActiveBanner(b)}
                  title={b.visible ? "Banner activo" : "Usar este banner"}
                  className={`p-1.5 rounded transition-colors ${b.visible ? 'bg-blue-500 text-white cursor-default' : 'bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600'}`}
                >
                  <Eye size={15} />
                </button>
                <button onClick={() => deleteOne(b)} className="p-1.5 bg-red-50 text-red-500 rounded hover:bg-red-100">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="text-right mt-4">
          <button onClick={saveOrder} className="px-6 py-2 bg-blue-600 text-white rounded text-sm">
            Guardar orden
          </button>
        </div>
      </div>


    {/* =====================  ADMIN NOTICIAS  ===================== */}

<div className="w-full max-w-2xl mt-20">
  <h2 className="text-3xl font-bold mb-4">Administrar Avisos / Noticias</h2>

  {/* Formulario para agregar */}
  <div className="border p-4 rounded mb-6">
    <h3 className="font-semibold mb-2">Crear nueva noticia</h3>

    <input
      placeholder="Título"
      className="w-full p-2 border mb-2"
      value={newsTitulo}
      onChange={(e) => setNewsTitulo(e.target.value)}
    />

    <input
      placeholder="URL imagen"
      className="w-full p-2 border mb-2"
      value={newsImagen}
      onChange={(e) => setNewsImagen(e.target.value)}
    />

    <textarea
      placeholder="Contenido"
      className="w-full p-2 border mb-2"
      value={newsContenido}
      onChange={(e) => setNewsContenido(e.target.value)}
    />

    <input
      placeholder="Fecha"
      className="w-full p-2 border mb-4"
      value={newsFecha}
      onChange={(e) => setNewsFecha(e.target.value)}
    />

    <button
      onClick={saveNews}
      className="px-4 py-2 bg-black text-white rounded flex items-center gap-2"
    >
      <Plus size={18} /> Agregar noticia
    </button>
  </div>

  {/* LISTA */}
  <div className="flex flex-col gap-4">
  {news.map((n, index) => (
  <div
    key={n.id ?? index}
    className="flex items-center justify-between border p-3 rounded shadow-sm"
  >
    <div className="flex items-center gap-4">
      <img
        src={n.imagen}
        className="w-20 h-20 object-cover rounded"
        alt={n.titulo}
      />
      <div>
        <p className="font-semibold">{n.titulo}</p>
        <p className="text-xs text-gray-500">{n.fecha}</p>
      </div>
    </div>

    <div className="flex gap-2">
      <button onClick={() => moveNewsUp(index)} className="p-2 bg-gray-200 rounded">
        <ArrowUp size={18} />
      </button>
      <button onClick={() => moveNewsDown(index)} className="p-2 bg-gray-200 rounded">
        <ArrowDown size={18} />
      </button>
      <button
        onClick={() => deleteNews(n.id)}
        className="p-2 bg-red-600 text-white rounded"
      >
        <Trash2 size={18} />
      </button>
    </div>
  </div>
))}

  </div>

  <div className="mt-4 text-right">
    <button
      onClick={saveNewsOrder}
      className="px-6 py-2 bg-blue-600 text-white rounded"
    >
      Guardar cambios
    </button>
  </div>
</div>
      
</div>


  );
}
