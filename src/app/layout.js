import "./globals.css";
import Header from "./components/Header";
import Link from "next/link";
import SetCustomerId from "./components/SetCustomerId";
import { Suspense } from "react";
import Sidebar from "./components/Sidebar";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="h-screen flex flex-col bg-white">
        <Suspense fallback={<div>Loading...</div>}>
          <SetCustomerId />
        </Suspense>

        {/* Header */}
        <Header />

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <Sidebar />

          {/* Main content */}
          <main className="flex-1 bg-white overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
