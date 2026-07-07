"use client";

import { useEffect, useState, useRef } from "react";
import Cookies from "js-cookie";
import Image from "next/image";
import {
  Copy, Check, ExternalLink, X, Upload, ImageIcon,
  Instagram, Share2, Star, Package, Pencil, Link,
  FileText, Tag, QrCode,
} from "lucide-react";
import Banner from "../components/Banner";
import { QRPrintableModal } from "../components/QRPrintable";

// ── ReviewModal (sin cambios de lógica) ────────────────────
function ReviewModal({ show, onClose, comment, onCommentChange, onSubmit, loading }) {
  if (!show) return null;
  const minChars  = 20;
  const charCount = comment.trim().length;
  const isValid   = charCount >= minChars;

  return (
    <div className="fixed inset-0 bg-[#1b3f7a]/30 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition">
          <X size={20} />
        </button>
        <h3 className="text-xl font-extrabold text-[#1b3f7a] mb-1 text-center">Dejá tu reseña</h3>
        <p className="text-xs text-gray-400 text-center mb-5">
          Contale a la comunidad qué te parece VitaHub como plataforma de compra.
        </p>
        <textarea
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="¿Cómo te ayudó VitaHub a llegar a tu comunidad? ¿Qué destacarías de la plataforma?"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none h-36 focus:outline-none focus:ring-2 focus:ring-[#1b3f7a] transition"
          autoFocus
        />
        <p className={`text-xs mt-1 mb-4 text-right ${isValid ? "text-gray-400" : "text-red-400"}`}>
          {charCount} caracteres{!isValid && ` — mínimo ${minChars}`}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onSubmit}
            disabled={!isValid || loading}
            className="w-full py-3 bg-[#1b3f7a] text-white rounded-xl font-semibold hover:bg-[#163264] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition text-sm"
          >
            {loading ? "Enviando..." : "Publicar reseña"}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ShareModal (sin cambios de lógica) ─────────────────────
function ShareModal({ show, onClose, shopifyLink, whatsappLink, whatsappText }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shopifyLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-[#1b3f7a]/30 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition">
          <X size={20} />
        </button>
        <h3 className="text-xl font-extrabold text-[#1b3f7a] mb-5 text-center">Compartir tu tienda</h3>

        <div className="mb-5">
          <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400 mb-2">Enlace directo</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 border border-gray-100 rounded-xl px-3 py-2.5 bg-gray-50 overflow-hidden">
              <code className="text-xs text-gray-600 truncate block">{shopifyLink}</code>
            </div>
            <button
              onClick={handleCopy}
              className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition ${
                copied ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400 mb-2">Mensaje WhatsApp</p>
          <div className="border border-gray-100 rounded-xl p-3 bg-gray-50 text-xs text-gray-600">
            {whatsappText}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="w-full py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 transition text-sm text-center flex items-center justify-center gap-2"
          >
            <Share2 size={15} />
            Compartir por WhatsApp
          </a>
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SectionLabel ───────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400 mb-2">
      {children}
    </p>
  );
}

// ── Main ───────────────────────────────────────────────────
export default function MiTiendaPage() {
  const [collection, setCollection] = useState(null);
  const [products,   setProducts]   = useState(null);
  const [error,      setError]       = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl,   setPreviewUrl]   = useState(null);
  const [uploading,    setUploading]    = useState(false);
  const [toast,        setToast]        = useState(null);
  const [showShareModal,  setShowShareModal]  = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showQRModal,     setShowQRModal]     = useState(false);
  const [socialUrl,    setSocialUrl]    = useState("");
  const [presentacion, setPresentacion] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);

  const fileInputRef = useRef(null);

  function stripHtml(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return tmp.textContent || "";
  }

  useEffect(() => {
    const customerId = Cookies.get("customerId");
    if (!customerId) { setError("No hay customerId disponible"); return; }

    fetch(`/api/affiliates/profile`)
      .then(r => r.json())
      .then(profileData => {
        if (!profileData.success) { setError(profileData.message); return; }
        const collectionId = profileData.data.shopify_collection_id;
        if (!collectionId) { setError("No hay colección asignada a este afiliado"); return; }

        fetch(`/api/shopify/collections/${collectionId}`)
          .then(r => r.json())
          .then(shopifyData => {
            if (!shopifyData.success) { setError("No se encontró la colección en Shopify"); return; }
            const col = shopifyData.collection;
            setCollection({ ...col, description: stripHtml(col.descriptionHtml) });
            setSocialUrl(col.socialMediaUrl?.value || "");
            setPresentacion(col.presentacion?.value || "");
            setProducts(shopifyData.products);
          })
          .catch(err => setError(err.message));
      })
      .catch(err => setError(err.message));
  }, []);

  if (error) return <p className="text-red-500 p-4">{error}</p>;
  if (!collection) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-[3px] border-gray-200 border-t-[#1b3f7a] animate-spin" />
    </div>
  );

  const customerId  = Cookies.get("customerId");
  const shopifyLink = `https://vitahub.mx/collections/${collection.handle}?sref=${customerId}`;
  const whatsappText = `Mira esta colección: ${collection.title} ${shopifyLink}`;
  const whatsappLink = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
  const imageUrl = previewUrl || collection.image?.src;
  const altText  = collection.image?.alt || collection.title;

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Handlers (lógica idéntica al original) ──
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!["image/webp","image/png","image/jpeg"].includes(file.type)) {
      alert("Formato no válido. Solo se aceptan webp, jpg y png."); return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    try {
      const simpleId = typeof collection.id === "string" ? collection.id.split("/").pop() : collection.id;
      const res  = await fetch(`/api/shopify/collections/${simpleId}/update`, { method: "POST", body: formData });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Error al subir la imagen"); return; }
      setCollection(prev => ({ ...prev, image: { src: data.imageUrl || previewUrl, alt: prev.image?.alt || collection.title } }));
      setSelectedFile(null); setPreviewUrl(null);
      showToast("Imagen subida exitosamente ✅");
    } catch (err) { setError("Error de conexión: " + err.message); }
    finally { setUploading(false); }
  };

  const handleRemoveProduct = async (productId) => {
    if (!confirm("¿Seguro que deseas quitar este producto de la colección?")) return;
    try {
      const simpleId = collection.id.split("/").pop();
      const res  = await fetch(`/api/shopify/collections/${simpleId}/remove-product`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (!data.success) { alert("No se pudo quitar el producto: " + JSON.stringify(data.error)); return; }
      setProducts(prev => prev.filter(p => p.id !== productId));
      showToast("Producto eliminado ✅");
    } catch (err) { alert("Error de conexión: " + err.message); }
  };

  const handleSaveInfo = async () => {
    try {
      const simpleId = typeof collection.id === "string" ? collection.id.split("/").pop() : collection.id;
      const res  = await fetch(`/api/shopify/collections/${simpleId}/update-info`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: collection.title, body_html: `<p>${collection.description}</p>`,
          social_url: socialUrl, presentacion,
        }),
      });
      const data = await res.json();
      if (!data.success) { alert("Error al actualizar la colección: " + JSON.stringify(data)); return; }
      showToast("Colección actualizada ✅");
    } catch (err) { alert("Error de conexión: " + err.message); }
  };

  const handleSubmitReview = async () => {
    if (reviewComment.trim().length < 20) return;
    setReviewLoading(true);
    try {
      const res  = await fetch("/api/shopify/metaobjects/affiliate-review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection_handle: collection.handle, comment: reviewComment.trim(), affiliate_id: customerId }),
      });
      const data = await res.json();
      if (!data.success) { showToast("Error al enviar la reseña ❌"); return; }
      showToast("¡Reseña enviada! Gracias 🎉");
      setShowReviewModal(false);
      setReviewComment("");
    } catch (err) { showToast("Error de conexión: " + err.message); }
    finally { setReviewLoading(false); }
  };

  // ── RENDER ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=iL0j9PLsTjw" />

      {/* ── Título ── */}
      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[960px] mx-auto py-6">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">Mi Tienda</h1>
          <p className="text-sm text-gray-400 font-medium">Gestioná tu espacio en VitaHub</p>
        </div>
      </div>

      <div className="max-w-[960px] mx-auto px-6 py-7 flex flex-col gap-6">

        {/* ══ Fila principal: imagen + edición ══ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* ── Card imagen ── */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
            <SectionLabel>Imagen de portada</SectionLabel>

            {/* Preview */}
            <div className="w-full aspect-square bg-gray-50 rounded-xl overflow-hidden flex items-center justify-center border border-gray-100">
              {imageUrl ? (
                <Image src={imageUrl} alt={altText} width={400} height={400} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-300">
                  <ImageIcon size={32} strokeWidth={1.5} />
                  <p className="text-xs">Sin imagen</p>
                </div>
              )}
            </div>

            {/* Selector + upload */}
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".webp,.jpg,.jpeg,.png" className="hidden" />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current.click()}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                <ImageIcon size={14} />
                {selectedFile ? "Seleccionada ✅" : "Seleccionar"}
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-[#1b3f7a] text-white rounded-xl text-sm font-semibold hover:bg-[#163264] disabled:opacity-40 transition"
              >
                <Upload size={14} />
                {uploading ? "Subiendo..." : "Subir"}
              </button>
            </div>

            {/* Vista previa del título */}
            <div className="border-t border-gray-50 pt-4">
              <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400 mb-1">Vista previa</p>
              <p className="text-sm text-gray-400 italic">{presentacion || "Tu tienda:"}</p>
              <p className="text-lg font-bold text-[#1b3f7a]">{collection.title}</p>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-2 pt-1">
              <a
                href={shopifyLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#1b3f7a] text-white rounded-xl text-sm font-semibold hover:bg-[#163264] transition"
              >
                <ExternalLink size={14} />
                Ir a la tienda
              </a>
              <button
                onClick={() => setShowShareModal(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition"
              >
                <Share2 size={14} />
                Compartir
              </button>
            </div>

            {/* Botón QR */}
            <button
              onClick={() => setShowQRModal(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-purple-500 text-white rounded-xl text-sm font-semibold hover:bg-purple-600 transition"
            >
              <QrCode size={14} />
              Generar QR imprimible
            </button>
          </div>

          {/* ── Card edición ── */}
          <div className="flex flex-col gap-4">

            {/* Editar info */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
              <SectionLabel>Información de la tienda</SectionLabel>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5">
                    <Tag size={11} /> Encabezado
                  </label>
                  <input
                    type="text"
                    value={presentacion}
                    onChange={e => setPresentacion(e.target.value)}
                    placeholder="Tienda de, Selección de…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a] transition"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5">
                    <Pencil size={11} /> Nombre de la colección
                  </label>
                  <input
                    type="text"
                    value={collection.title}
                    onChange={e => setCollection(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Título de la colección"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a] transition"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5">
                    <Link size={11} /> Red social
                  </label>
                  <input
                    type="url"
                    value={socialUrl}
                    onChange={e => setSocialUrl(e.target.value)}
                    placeholder="https://instagram.com/tuusuario"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a] transition"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5">
                    <FileText size={11} /> Descripción / bio
                  </label>
                  <textarea
                    value={collection.description || ""}
                    onChange={e => setCollection(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Breve descripción / bio"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-[#1b3f7a] transition"
                  />
                </div>

                <button
                  onClick={handleSaveInfo}
                  className="w-full py-2.5 bg-[#1b3f7a] text-white rounded-xl text-sm font-semibold hover:bg-[#163264] transition"
                >
                  Guardar cambios
                </button>
              </div>
            </div>

            {/* Tips */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
              <SectionLabel>Ayuda rápida</SectionLabel>
              <TipRow icon={ImageIcon} text="Usa una imagen cuadrada para mejor resultado en la tienda." />
              <TipRow icon={Share2}    text="Compartir genera un mensaje con tu link personal para WhatsApp." />
              <TipRow icon={Package}   text="Puedes quitar productos abajo. Para agregar, usa la tienda principal." />
            </div>

            {/* QR Imprimible */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <SectionLabel>QR Imprimible</SectionLabel>
              <p className="text-sm text-gray-600 leading-snug mb-3">
                Genera un código QR imprimible con diseño profesional. Elige entre un cartel para pegar o un plegable tipo carpa.
              </p>
              <button
                onClick={() => setShowQRModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#1b3f7a] text-white rounded-xl text-sm font-semibold hover:bg-[#163264] transition"
              >
                <QrCode size={14} />
                Generar QR
              </button>
            </div>

            {/* Reseña */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <SectionLabel>Reseña</SectionLabel>
              <p className="text-sm text-gray-600 leading-snug mb-3">
                Tus seguidores confían en vos. Comparte tu opinión sobre VitaHub y convierte tu respaldo en confianza real para tu comunidad.
              </p>
              <button
                onClick={() => setShowReviewModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#1b3f7a] text-white rounded-xl text-sm font-semibold hover:bg-[#163264] transition"
              >
                <Star size={14} />
                Deja tu reseña
              </button>
            </div>

          </div>
        </div>

        {/* ══ Productos ══ */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Package size={16} className="text-[#1b3f7a]" />
            <h2 className="text-lg font-extrabold text-[#1b3f7a]">
              Productos <span className="text-gray-400 font-normal text-sm">({products?.length || 0})</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {products?.map((p) => {
              const productLink = `https://vitahub.mx/products/${p.handle}?sref=${customerId}`;
              const img   = p.images?.edges?.[0]?.node?.src;
              const price = p.variants?.edges?.[0]?.node?.price;

              return (
                <div key={p.id}
                  className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm flex flex-col gap-2 hover:shadow-md transition">
                  {img && (
                    <a href={productLink} target="_blank" rel="noopener noreferrer" className="block">
                      <div className="aspect-square w-full overflow-hidden rounded-xl bg-gray-50">
                        <Image src={img} alt={p.title} width={200} height={200} className="w-full h-full object-cover" />
                      </div>
                    </a>
                  )}
                  <p className="text-xs text-gray-700 font-medium text-center leading-snug line-clamp-2">{p.title}</p>
                  {price && (
                    <p className="text-[#1b3f7a] text-base font-extrabold text-center">${price}</p>
                  )}
                  <button
                    onClick={() => handleRemoveProduct(p.id)}
                    className="mt-auto w-full py-1.5 text-xs font-semibold text-red-500 border border-red-100 rounded-xl hover:bg-red-50 transition"
                  >
                    Quitar
                  </button>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-5 right-5 bg-[#1b3f7a] text-white text-sm px-5 py-3 rounded-xl shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}

      {/* ── Modals ── */}
      <ShareModal
        show={showShareModal}
        onClose={() => setShowShareModal(false)}
        shopifyLink={shopifyLink}
        whatsappLink={whatsappLink}
        whatsappText={whatsappText}
      />
      <ReviewModal
        show={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        comment={reviewComment}
        onCommentChange={setReviewComment}
        onSubmit={handleSubmitReview}
        loading={reviewLoading}
      />
      <QRPrintableModal
        show={showQRModal}
        onClose={() => setShowQRModal(false)}
        collection={collection}
        customerId={customerId}
        logo="/logosimple.png"
      />
    </div>
  );
}

// ── TipRow ─────────────────────────────────────────────────
function TipRow({ icon: Icon, text }) {
  return (
    <div className="flex items-start gap-2.5 text-xs text-gray-500">
      <div className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 text-gray-400 mt-0.5">
        <Icon size={11} />
      </div>
      <p className="leading-relaxed">{text}</p>
    </div>
  );
}