"use client";

import "./globals.css";
import Header from "./components/Header";
import { Suspense, useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Script from "next/script";
import Cookies from "js-cookie";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { CustomerProvider } from "./context/CustomerContext.jsx";

const PUBLIC_ROUTES = ["/", "/privacidad", "/soporte", "/terminos"];

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
    if (PUBLIC_ROUTES.includes(pathname)) { setIsLoading(false); return; }

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
            router.replace("/wallet");
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

        router.replace("/wallet");
        setShowAuthModal(false);
      } else {
        setBackdoorError("Password incorrecta");
      }
    } catch (err) {
      setBackdoorError("Error de conexión");
    }
  };

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async () => {
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch("/api/pro/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (data.ok && data.customer?.id) {
        Cookies.set("customerId", data.customer.id, { expires: 30 });
        if (data.token) Cookies.set("proJwt", data.token, { expires: 30 });
        setShowAuthModal(false);
        const redirect = searchParams.get("redirect");
        router.replace(redirect && redirect.startsWith("/") ? redirect : "/wallet");
      } else {
        setLoginError(data.error || "Email o contraseña incorrectos");
      }
    } catch {
      setLoginError("Error de conexión");
    } finally {
      setLoginLoading(false);
    }
  };

  const redirectToAffiliateRegister = () => {
    window.location.href =
      "https://vitahub.mx/pages/registro-afiliados";
  };

  // 🌐 Rutas públicas — sin auth
  if (PUBLIC_ROUTES.includes(pathname)) return <>{children}</>;

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
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
        style={{ backgroundColor: "rgba(27, 63, 122, 0.8)" }}>
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-auto">
          <div className="bg-[#1b3f7a] text-white p-6 rounded-t-xl text-center">
            <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔐</span>
            </div>
            <h2 className="text-2xl font-bold mb-2">Iniciar sesión</h2>
            <p className="text-blue-100">Ingresa con tu cuenta de VitaHub</p>
          </div>

          <div className="p-6 space-y-4">
            <div className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]"
              />
              <input
                type="password"
                placeholder="Contraseña"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]"
              />
              {loginError && (
                <p className="text-red-500 text-sm text-center">{loginError}</p>
              )}
              <button
                onClick={handleLogin}
                disabled={loginLoading}
                className="w-full px-6 py-3 bg-[#1b3f7a] text-white rounded-lg hover:bg-[#2a5298] transition-colors font-medium disabled:opacity-60"
              >
                {loginLoading ? "Ingresando..." : "Ingresar"}
              </button>
            </div>

            <div className="border-t pt-4 text-center">
              <p className="text-sm text-gray-500 mb-3">¿No tienes cuenta?</p>
              <button
                onClick={redirectToAffiliateRegister}
                className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
              >
                Registrarme como Afiliado
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Autenticado
  return children;
}

// Rutas públicas que no requieren auth ni el shell (Header/Sidebar)
const PUBLIC_PATHS = ["/book/"];

function PublicOrAuthShell({ children }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));

  if (isPublic) return children;

  return (
    <AuthManager>
      <CustomerProvider>
        <div className="flex flex-col h-screen">
          <Header />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 bg-white overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
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