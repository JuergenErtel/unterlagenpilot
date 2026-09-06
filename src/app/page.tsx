import type { Metadata } from "next";
import { Landingpage } from "@/components/marketing/landingpage";

export const dynamic = "force-dynamic";

/**
 * Die Startseite ist die Landingpage und liegt VOR dem Site-Gate
 * (`src/lib/security/public-paths.ts`). Wer angemeldet ist, kommt ueber
 * "Anmelden" bzw. /login direkt auf sein Dashboard – die Startseite selbst
 * leitet nicht mehr um, damit auch Kunden mit Konto sie ansehen koennen.
 */
export const metadata: Metadata = {
  title: "BaufiDesk – Unterlagen-KI und Backoffice für Baufinanzierungsvermittler",
  description:
    "Die Akte wird einreichungsfertig: KI erkennt, liest und prüft jede Unterlage – oder unser Backoffice übernimmt die komplette Aufbereitung. Für Baufinanzierungsvermittler.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return <Landingpage />;
}
