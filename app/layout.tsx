import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pakistan VATSIM Dashboard",
  description: "Live VATSIM activity dashboard for OPKR/OPLR FIRs - Controllers & Pilots",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body
        style={{
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          margin: 0,
          padding: 0,
          backgroundColor: "#0f172a",
          minHeight: "100vh",
          color: "#e2e8f0",
        }}
      >
        {children}
      </body>
    </html>
  );
}
