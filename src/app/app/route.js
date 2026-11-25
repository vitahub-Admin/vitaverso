import { responderDescarga } from "@/lib/descargaApp";

// Mi Vitahub (clientes): manda a App Store o Google Play según el celular
export function GET(req) {
  return responderDescarga(req, "cliente");
}
