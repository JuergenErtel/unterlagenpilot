import type { Metadata } from "next";

/**
 * Erzwungen dynamisches Rendern fuer die GESAMTE App – Voraussetzung der
 * Nonce-CSP (siehe `src/middleware.ts`): Jede Antwort traegt eine frische
 * Nonce im CSP-Header, also muss auch das HTML pro Request mit genau dieser
 * Nonce gerendert werden. Eine statisch vorgerenderte/gecachte Seite truege
 * die Nonce ihres Build- bzw. Erstbesuchs und ihre Skripte waeren fuer alle
 * weiteren Besucher blockiert. Kein spuerbarer Verlust: Die App ist
 * DB-getrieben und war fast vollstaendig ohnehin dynamisch; die wenigen
 * frueher statischen Seiten (Rechtstexte, Gate) sind reine Textseiten.
 */
export const dynamic = "force-dynamic";

import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Archivo } from "next/font/google";
import "./globals.css";

/**
 * Displayschrift fuer die wenigen grossen Momente (Fallnummer, Reifegrad,
 * Seitentitel, Registerbeschriftungen). Archivo ist eine Grotesk mit
 * institutionellem, leicht technischem Charakter – sie liest wie eine
 * Beschilderung, nicht wie eine Werbeseite. Bewusst NICHT fuer Fliesstext:
 * dort bleibt Geist, das auf Bildschirmlaenge ruhiger laeuft.
 *
 * Wird von next/font selbst gehostet – die Content-Security-Policy erlaubt
 * keine fremden Schriftquellen.
 */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

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
  // Auto-Übersetzer (Google Translate, In-App-Browser) dürfen die App-UI nicht
  // umbauen: sie ersetzen Textknoten, danach findet React beim Reconcile den
  // parentNode nicht mehr → "Cannot read properties of null (reading
  // 'parentNode')". Die Oberfläche ist ohnehin fest deutsch.
  other: { google: "notranslate" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="de"
      translate="no"
      className={`notranslate ${GeistSans.variable} ${GeistMono.variable} ${archivo.variable}`}
    >
      <body className="min-h-screen bg-canvas font-sans antialiased">{children}</body>
    </html>
  );
}
