import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UnterlagenPilot – KI-Sachbearbeiter für Baufinanzierung",
  description:
    "KI-gestützter Dokumenten-, Prüf- und Übergabe-Assistent für Baufinanzierungsvermittler. Modul von immocockpit24.de.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
