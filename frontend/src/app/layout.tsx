import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";

export const metadata: Metadata = {
  title: isStaging ? "Nebulae ERP \u2014 STAGING" : "Nebulae ERP",
  description: "Nebulae ERP & CRM",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {isStaging && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 9999,
              backgroundColor: "#EAB308",
              color: "#1a1a1a",
              textAlign: "center",
              padding: "6px 12px",
              fontWeight: 700,
              fontSize: "13px",
              letterSpacing: "0.05em",
              pointerEvents: "none",
            }}
          >
            &#9888;&#65039; ENTORNO DE PRUEBAS &mdash; DATOS NO PRODUCTIVOS
          </div>
        )}
        <div style={isStaging ? { paddingTop: "33px" } : {}}>
          {children}
        </div>
      </body>
    </html>
  );
}
