// Registro de afiliados desde Pro. La pantalla vive en RegistroClient.jsx; el trabajo del servidor, en
// src/app/api/registro/route.js y src/lib/registroAfiliado.js. Abierto solo con REGISTRO_PRO_ACTIVO=1.
import { Suspense } from "react";
import RegistroClient from "./RegistroClient";

export const metadata = {
  title: "Crea tu cuenta de Vitahub Pro",
  description:
    "Regístrate como profesional de la salud en Vitahub Pro: arma protocolos de suplementación, da seguimiento a tus pacientes y recomienda más de 2,000 suplementos originales.",
};

export default function RegistroPage() {
  return (
    <Suspense fallback={null}>
      <RegistroClient />
    </Suspense>
  );
}
