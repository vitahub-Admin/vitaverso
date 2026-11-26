"use client";
import { createContext, useContext, useState, useEffect } from "react";

const SidebarContext = createContext({
  collapsed: false, toggle: () => {},
  mobileOpen: false, setMobileOpen: () => {}, isMobile: false,
});

// Debajo de este ancho (el `sm` de Tailwind) el menú es un cajón que se abre con
// la hamburguesa, en vez de una columna fija que le quita lugar al contenido.
const MOBILE_QUERY = "(max-width: 639px)";

export function SidebarProvider({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebarCollapsed");
      if (stored !== null) setCollapsed(stored === "true");
    } catch {}
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) setMobileOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const toggle = () => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem("sidebarCollapsed", String(next)); } catch {}
      return next;
    });
  };

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, mobileOpen, setMobileOpen, isMobile }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
