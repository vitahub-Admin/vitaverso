"use client";

import "./globals.css";
import Header from "./components/Header";
import { Suspense, useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import LoginModal from "./components/LoginModal";
import Script from "next/script";
import Cookies from "js-cookie";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { CustomerProvider } from "./context/CustomerContext.jsx";
import { SidebarProvider } from "./context/SidebarContext.jsx";
import { TourProvider } from "./context/TourContext.jsx";

const PUBLIC_ROUTES = ["/", "/privacidad", "/soporte", "/terminos"];

// El cobro de una venta de consultorio lo abre el paciente, que no tiene
// cuenta: pedirle login ahí sería pedirle que se registre para poder pagar.
const esRutaPublica = (p) => PUBLIC_ROUTES.includes(p) || (p || "").startsWith("/cobro/");

// Adónde ir después de iniciar sesión: la página a la que se quería entrar, sin
// los parámetros del login. Si no, un link como /armador-carritos?fromCart=TOKEN
// (el "Continuar en PRO" de la tienda) terminaba en /wallet y perdía el carrito.
function destinoTrasLogin() {
  const url = new URL(window.location.href);
  ["enc", "t", "sig", "aId", "redirect"].forEach((p) => url.searchParams.delete(p));
  const destino = url.pathname + url.search;
  return url.pathname !== "/" ? destino : "/wallet";
}

// Solo rutas internas: "//otro-sitio.com" también empieza con "/"
const esRutaInterna = (r) => typeof r === "string" && r.startsWith("/") && !r.startsWith("//");

function AuthManager({ children }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showBackdoorModal, setShowBackdoorModal] = useState(false);
  const [pendingBackdoorId, setPendingBackdoorId] = useState(null);
  const [backdoorPassword, setBackdoorPassword] = useState("");
  const [backdoorError, setBackdoorError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (esRutaPublica(pathname)) { setIsLoading(false); return; }

    const enc = searchParams.get("enc");
    const t = searchParams.get("t");
    const sig = searchParams.get("sig");
    const aId = searchParams.get("aId");

    const customerIdFromCookie = Cookies.get("customerId");

    console.log("🔐 Auth check:", {
      enc: !!enc,
      t: !!t,
      sig: !!sig,
      aId: !!aId,
      cookie: customerIdFromCookie,
    });

    // 1️⃣ BACKDOOR → SOLO ABRE MODAL
    if (aId) {
      setPendingBackdoorId(aId);
      setShowBackdoorModal(true);
      setIsLoading(false);
      return;
    }

    // 2️⃣ VERIFY TOKEN (PRODUCCIÓN)
    if (enc && t && sig) {
      fetch("/api/verify-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enc, t, sig }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.ok && data.customerId) {
            Cookies.set("customerId", data.customerId, { expires: 30 });
            setShowAuthModal(false);
            router.replace(destinoTrasLogin());
          } else {
            Cookies.remove("customerId");
            setShowAuthModal(true);
          }
          setIsLoading(false);
        })
        .catch(() => {
          Cookies.remove("customerId");
          setShowAuthModal(true);
          setIsLoading(false);
        });

      return;
    }

    // 3️⃣ COOKIE EXISTENTE
    if (customerIdFromCookie) {
      setShowAuthModal(false);
      setIsLoading(false);
      return;
    }

    // 4️⃣ NO AUTENTICADO
    setShowAuthModal(true);
    setIsLoading(false);
  }, [searchParams]);

  // 🔓 BACKDOOR LOGIN HANDLER
  const handleBackdoorLogin = async () => {
    setBackdoorError("");

    try {
      const res = await fetch("/api/backdoor-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aId: pendingBackdoorId,
          password: backdoorPassword,
        }),
      });

      const data = await res.json();

      if (data.ok && data.customerId) {
        Cookies.set("customerId", data.customerId, { expires: 30 });

        setShowBackdoorModal(false);
        setPendingBackdoorId(null);
        setBackdoorPassword("");

        router.replace(destinoTrasLogin());
        setShowAuthModal(false);
      } else {
        setBackdoorError("Password incorrecta");
      }
    } catch (err) {
      setBackdoorError("Error de conexión");
    }
  };

  // Devuelve { error } cuando falla: el modal muestra el mensaje y se queda
  // abierto. Si sale bien no devuelve nada, porque ya navegó.
  const handleLogin = async (email, password) => {
    try {
      const res = await fetch("/api/pro/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.ok && data.customer?.id) {
        Cookies.set("customerId", data.customer.id, { expires: 30 });
        if (data.token) Cookies.set("proJwt", data.token, { expires: 30 });
        setShowAuthModal(false);
        const redirect = searchParams.get("redirect");
        router.replace(esRutaInterna(redirect) ? redirect : destinoTrasLogin());
        return {};
      }
      return { error: data.error || "Correo o contraseña incorrectos" };
    } catch {
      return { error: "Error de conexión" };
    }
  };

  const redirectToAffiliateRegister = () => {
    window.location.href =
      "https://vitahub.mx/pages/registro-afiliados";
  };

  // 🌐 Rutas públicas — sin auth
  if (esRutaPublica(pathname)) return <>{children}</>;

  // ⏳ Loader
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1b3f7a] mx-auto mb-2"></div>
          <p className="text-gray-600 text-sm">
            Verificando acceso...
          </p>
        </div>
      </div>
    );
  }

  // 🔓 Backdoor Modal
  if (showBackdoorModal) {
    return (
      <div className="fixed inset-0  flex items-center justify-center z-50"
      style={{ backgroundColor: "rgba(27, 63, 122, 0.8)" }}>
        <div className="bg-white p-6 rounded-xl max-w-sm w-full">
          <h2 className="text-xl font-bold mb-4">
            Acceso Interno
          </h2>

          <input
            type="password"
            value={backdoorPassword}
            onChange={(e) =>
              setBackdoorPassword(e.target.value)
            }
            placeholder="Ingresar clave"
            className="w-full border p-2 rounded mb-3"
          />

          {backdoorError && (
            <p className="text-red-500 text-sm mb-2">
              {backdoorError}
            </p>
          )}

          <button
            onClick={handleBackdoorLogin}
            className="w-full bg-[#1b3f7a] text-white py-2 rounded"
          >
            Confirmar
          </button>
        </div>
      </div>
    );
  }

  // 🔐 Modal normal
  if (showAuthModal) {
    return <LoginModal onLogin={handleLogin} onRegister={redirectToAffiliateRegister} />;
  }

  // ✅ Autenticado
  return children;
}

// Rutas públicas que no requieren auth ni el shell (Header/Sidebar).
// /cobro/ la abre el paciente: no tiene cuenta y no debería ver el menú del
// profesional ni el logo "Pro · Profesionales", que no le habla a él.
const PUBLIC_PATHS = ["/book/", "/cobro/"];

function PublicOrAuthShell({ children }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));

  if (isPublic) return children;

  return (
    <AuthManager>
      <CustomerProvider>
        <SidebarProvider>
          <TourProvider>
            <div className="flex flex-col h-screen">
              <Header />
              <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 bg-white overflow-y-auto">
                  {children}
                </main>
              </div>
            </div>
          </TourProvider>
        </SidebarProvider>
      </CustomerProvider>
    </AuthManager>
  );
}

export default function RootLayout({ children }) {
  useEffect(() => {
    import("react-microsoft-clarity").then(({ clarity }) => {
      clarity.init("tydr53wsez");
    });
  }, []);

  return (
    <html lang="en">
      <body className="h-screen flex flex-col bg-white">
        <Script
          src="https://t.contentsquare.net/uxa/bc20e7d4875d3.js"
          strategy="afterInteractive"
        />

        <Suspense fallback={<div className="fixed inset-0 bg-white flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1b3f7a]" /></div>}>
          <PublicOrAuthShell>{children}</PublicOrAuthShell>
        </Suspense>
      </body>
    </html>
  );
}