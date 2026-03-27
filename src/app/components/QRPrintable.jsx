"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Printer, X } from "lucide-react";

const QRCodeSVG = dynamic(
  () => import("qrcode.react").then(mod => ({ default: mod.QRCodeSVG })),
  { ssr: false }
);

// A4: 297mm total. Márgenes: 1/5 cada uno = ~59mm. Mitades: ~89mm cada una.
const MARGIN_H = "59mm";
const HALF_H   = "89mm";

export function QRPrintableModal({ show, onClose, collection, customerId, logo }) {
  const cartelRef   = useRef();
  const plegableRef = useRef();
  const [format, setFormat] = useState("cartel");

  if (!show) return null;

  const shopifyLink = `https://vitahub.mx/collections/${collection.handle}?sref=${customerId}`;
  const imageUrl    = collection.image?.src;

  const handlePrint = () => {
    const ref = format === "cartel" ? cartelRef : plegableRef;
    if (!ref.current) return;

    const styles = Array.from(document.styleSheets)
      .map(sheet => {
        try { return Array.from(sheet.cssRules).map(r => r.cssText).join("\n"); }
        catch { return ""; }
      })
      .join("\n");

    // Convertir rutas relativas a absolutas para que carguen en el blob
    const htmlContent = ref.current.outerHTML
      .replace(/src="([^"]+)"/g, (match, url) => {
        if (url.startsWith('http') || url.startsWith('data:')) return match;
        if (url.startsWith('/')) return `src="${window.location.origin}${url}"`;
        return match;
      });

    const html = `<html>
      <head>
        <meta charset="utf-8" />
        <title>Imprimir</title>
        <style>${styles}</style>
        <style>
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          img { image-orientation: none; }
          body { margin: 0; padding: 0; background: white; }
          @media print { @page { size: A4; margin: 0; } }
        </style>
      </head>
      <body>${htmlContent}</body>
    </html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url);
    setTimeout(() => { win.print(); win.close(); URL.revokeObjectURL(url); }, 600);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition z-10">
          <X size={20} />
        </button>

        <h3 className="text-2xl font-extrabold text-[#1b3f7a] mb-1">Generar QR imprimible</h3>
        <p className="text-sm text-gray-400 mb-6">Elige el formato que prefieres</p>

        {/* Selector */}
        <div className="flex gap-3 mb-6">
          {["cartel", "plegable"].map(f => (
            <button key={f} onClick={() => setFormat(f)}
              className={`flex-1 py-2.5 rounded-lg font-semibold transition ${
                format === f ? "bg-[#1b3f7a] text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f === "cartel" ? "Cartel (para pegar)" : "Plegable (tipo carpa)"}
            </button>
          ))}
        </div>

        {/* Preview — solo visual, escalada */}
        <div className="mb-6 bg-gray-50 rounded-lg overflow-hidden flex justify-center items-start p-2"
          style={{ minHeight: "auto", maxHeight: format === "plegable" ? "500px" : "auto" }}
        >
          {format === "cartel" ? (
            <div style={{ transform: "scale(0.75)", transformOrigin: "top center", width: "210mm" }}>
              <CartelFormat collection={collection} shopifyLink={shopifyLink} imageUrl={imageUrl} logo={logo} />
            </div>
          ) : (
            <div style={{ transform: "scale(0.45)", transformOrigin: "top center", width: "210mm" }}>
              <PlegableFormat collection={collection} shopifyLink={shopifyLink} imageUrl={imageUrl} logo={logo} />
            </div>
          )}
        </div>

        {/* Elemento real para imprimir — oculto, fuera del flujo */}
        <div style={{ position: "fixed", top: "-9999px", left: "-9999px", zIndex: -1 }}>
          <div ref={cartelRef} style={{ width: "210mm", height: "auto", background: "white", padding: "20mm", display: "flex", alignItems: "flex-start", justifyContent: "flex-start" }}>
            <CartelFormat collection={collection} shopifyLink={shopifyLink} imageUrl={imageUrl} logo={logo} />
          </div>
          <div ref={plegableRef}>
            <PlegableFormat collection={collection} shopifyLink={shopifyLink} imageUrl={imageUrl} logo={logo} />
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-2">
          <button onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1b3f7a] text-white rounded-lg font-semibold hover:bg-[#163264] transition"
          >
            <Printer size={16} /> Imprimir
          </button>
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg font-semibold hover:bg-gray-50 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CARTEL ─────────────────────────────────────────────────────────────────

function CartelFormat({ collection, shopifyLink, imageUrl, logo }) {
  return (
    <div style={{ width: "300px", height: "auto", background: "rgba(27, 63, 122, 0.2)", border: "2px solid #1b3f7a", borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Logo (70% ancho, centrado) */}
        {logo && (
          <>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <img
                src={logo}
                alt="VitaHub"
                style={{ height: "20px", width: "auto", maxWidth: "70%" }}
              />
            </div>
            <div style={{ alignSelf: "center", width: "70%", height: "3px", background: "#1b3f7a" }} />
          </>
        )}

        {/* Imagen + Nombre + Visita */}
        <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
          {/* Imagen cuadrada */}
          {imageUrl && (
            <div style={{ flex: "0 0 60px", width: "60px", height: "60px", borderRadius: "6px", overflow: "hidden", background: "#f3f4f6" }}>
              <img
                src={imageUrl}
                alt={collection.title}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          )}

          {/* Nombre + Visita mi selección — alineado con imagen */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0" }}>
            <p style={{ fontSize: "14px", fontWeight: "800", color: "#1b3f7a", margin: "0", lineHeight: "1.2", wordBreak: "break-word" }}>
              {collection.title}
            </p>
            <p style={{ fontSize: "12px", color: "#555", fontWeight: "500", fontStyle: "italic", margin: "0" }}>
              Visita mi selecci&oacute;n
            </p>
          </div>
        </div>

        {/* QR — rectángulo blanco con padding */}
        <div style={{ background: "white", borderRadius: "8px", padding: "12px", display: "flex", justifyContent: "center" }}>
          <QRCornerBorder>
            <QRCodeSVG value={shopifyLink} size={170} level="H" marginSize={2} />
          </QRCornerBorder>
        </div>
      </div>
  );
}

// ── QR CORNER BORDER ───────────────────────────────────────────────────────

function QRCornerBorder({ children }) {
  const c = "#1b3f7a";
  const w = "3px";
  const r = "8px";
  const pct = "30%";
  const corner = (pos) => {
    const [v, h] = pos.split("-");
    return (
      <div style={{
        position: "absolute",
        [v]: 0, [h]: 0,
        width: pct, height: pct,
        [`border${v.charAt(0).toUpperCase()+v.slice(1)}`]: `${w} solid ${c}`,
        [`border${h.charAt(0).toUpperCase()+h.slice(1)}`]: `${w} solid ${c}`,
        [`border${v.charAt(0).toUpperCase()+v.slice(1)}${h.charAt(0).toUpperCase()+h.slice(1)}Radius`]: r,
      }} />
    );
  };
  return (
    <div style={{ position: "relative", display: "inline-block", padding: "8px" }}>
      {corner("top-left")}
      {corner("top-right")}
      {corner("bottom-left")}
      {corner("bottom-right")}
      {children}
    </div>
  );
}

// ── PLEGABLE ───────────────────────────────────────────────────────────────

function HalfContent({ collection, shopifyLink, imageUrl, logo, flipped }) {
  const content = (
    <div style={{ display: "flex", width: "210mm", height: HALF_H, background: "white", overflow: "hidden" }}>

      {/* Columna izquierda: datos (60%) */}
      <div style={{
        flex: "0 0 60%",
        padding: "8mm 10mm",
        background: "rgba(27, 63, 122, 0.2)",
        display: "flex",
        flexDirection: "column",
        gap: "4mm",
        overflow: "hidden",
      }}>
        {/* Logo */}
        {logo && (
          <img
            src={logo}
            alt="VitaHub"
            style={{ height: "auto", width: "auto", maxHeight: "12mm", maxWidth: "100%", objectFit: "contain", objectPosition: "left" }}
          />
        )}

        {/* Línea separadora gruesa */}
        <div style={{ height: "2px", background: "#1b3f7a" }} />

        {/* Foto + Nombre + Descripción */}
        <div style={{ display: "flex", gap: "4mm", flex: 1, overflow: "hidden" }}>

          {/* Foto cuadrada */}
          {imageUrl && (
            <div style={{ flex: "0 0 35%", aspectRatio: "1/1", borderRadius: "6px", overflow: "hidden", background: "#f3f4f6" }}>
              <img
                src={imageUrl}
                alt={collection.title}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          )}

          {/* Nombre + Descripción */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" }}>
            <p style={{
              fontSize: "clamp(12px, 3vw, 20px)",
              fontWeight: "900",
              color: "#1b3f7a",
              lineHeight: "1.1",
              margin: "0",
              wordBreak: "break-word",
            }}>
              {collection.title}
            </p>

            {collection.description && (
              <p style={{
                fontSize: "10px",
                color: "#555",
                lineHeight: "1.3",
                margin: "0",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
              }}>
                {collection.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Columna derecha: QR (40%) */}
      <div style={{
        flex: "0 0 40%",
        padding: "8mm",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <p style={{ fontSize: "16px", fontWeight: "500", fontStyle: "italic", color: "#333", textAlign: "center", margin: "0" }}>
          Visita mi selecci&oacute;n
        </p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <QRCornerBorder>
            <QRCodeSVG value={shopifyLink} size={160} level="H" marginSize={2} />
          </QRCornerBorder>
        </div>

        <p style={{ fontSize: "12px", fontWeight: "300", color: "#888", wordBreak: "break-all", margin: "0", textAlign: "center", lineHeight: "1.3" }}>
          {shopifyLink}
        </p>
      </div>
    </div>
  );

  if (flipped) {
    return <div style={{ transform: "rotate(180deg)", transformOrigin: "center" }}>{content}</div>;
  }
  return content;
}

function DashedLine() {
  return (
    <div style={{ width: "210mm", borderTop: "1.5px dashed #bbb" }} />
  );
}

function PlegableFormat({ collection, shopifyLink, imageUrl, logo }) {
  return (
    <div style={{ width: "210mm", background: "white", margin: "0 auto" }}>

      {/* Margen base superior — 1/5 del A4 */}
      <div style={{ height: MARGIN_H, background: "white" }}>
        <DashedLine />
      </div>

      {/* Mitad superior — espejada */}
      <HalfContent collection={collection} shopifyLink={shopifyLink} imageUrl={imageUrl} logo={logo} flipped={true} />

      {/* Línea de pliegue central */}
      <div style={{ padding: "3px 0" }}>
        <DashedLine />
      </div>

      {/* Mitad inferior — normal */}
      <HalfContent collection={collection} shopifyLink={shopifyLink} imageUrl={imageUrl} logo={logo} flipped={false} />

      {/* Margen base inferior — 1/5 del A4 */}
      <div style={{ height: MARGIN_H, background: "white" }}>
        <DashedLine />
      </div>

      {/* Instrucciones — solo en pantalla */}
      <div className="print:hidden" style={{ marginTop: "12px", fontSize: "11px", color: "#999", textAlign: "center", lineHeight: "1.8" }}>
        <p>Imprimir en A4 — sin márgenes, ajustar a página</p>
        <p>Cortar por las líneas punteadas externas</p>
        <p>Doblar por la línea del centro</p>
        <p>Pegar los márgenes de base laterales para que quede parado</p>
      </div>
    </div>
  );
}
