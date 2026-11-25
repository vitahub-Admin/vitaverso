import { responderDescarga } from "@/lib/descargaApp";

// Vitahub Pro (profesionales): manda a App Store o Google Play según el celular
export function GET(req) {
  return responderDescarga(req, "pro");
}
