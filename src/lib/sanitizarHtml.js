import DOMPurify from "dompurify";

// HTML que viene de Shopify (descripciones de producto). Se limpia antes de
// pintarlo; en el servidor devuelve vacío porque esos bloques solo se pintan
// después de un fetch en el cliente.
export function sanitizarHtml(html) {
  if (!html || typeof window === "undefined") return "";
  return DOMPurify.sanitize(String(html));
}
