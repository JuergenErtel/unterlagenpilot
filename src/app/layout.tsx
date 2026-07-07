import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://baufidesk.de"),
  title: "BaufiDesk – KI-Sachbearbeiter für Baufinanzierung",
  description:
    "Unterlagen prüfen, Daten extrahieren, fehlende Unterlagen erkennen und Fälle einreichungsfertig für Europace, FinLink und eHyp home machen.",
  openGraph: {
    title: "BaufiDesk – KI-Sachbearbeiter für Baufinanzierung",
    description:
      "Unterlagen prüfen, Daten extrahieren, fehlende Unterlagen erkennen und Fälle einreichungsfertig machen.",
    type: "website",
    locale: "de_DE",
    siteName: "BaufiDesk",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-canvas font-sans antialiased">{children}</body>
    </html>
  );
}
