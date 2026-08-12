import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { ladeBank } from "@/lib/banken/abfrage";
import { statusAnzeige } from "@/lib/banken/status";
import { KATEGORIE_REIHENFOLGE } from "@/lib/banken/kategorien";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/lib/ui/tone";

export const dynamic = "force-dynamic";

/** TONE fuehrt keine Badge-Variante – hier die Zuordnung. */
const BADGE: Record<Tone, "success" | "warning" | "destructive" | "ai" | "neutral"> = {
  ready: "success",
  review: "warning",
  blocker: "destructive",
  ai: "ai",
  neutral: "neutral",
};

const datum = (d: Date | null) => (d ? d.toLocaleDateString("de-DE") : "—");

/** Reihenfolge der Abschnitte wie im Europace-Wiki; Unbekanntes hinten dran. */
const ABSCHNITT_REIHENFOLGE = [
  "Antragsteller",
  "Immobilie",
  "Finanzierungslösung",
  "Prolongation",
  "Hinweise zum Prozess",
  "Hinweise zur Einreichung",
  "Hinweise zur Abbildung auf der Plattform",
];

function MERKMAL_ABSCHNITTE(
  merkmale: Array<{ abschnitt: string; unterabschnitt: string; bezeichnung: string; wert: string }>
) {
  const nach = new Map<string, typeof merkmale>();
  for (const m of merkmale) {
    const liste = nach.get(m.abschnitt) ?? [];
    liste.push(m);
    nach.set(m.abschnitt, liste);
  }
  return [...nach.entries()].sort(
    (a, b) =>
      (ABSCHNITT_REIHENFOLGE.indexOf(a[0]) + 1 || 99) - (ABSCHNITT_REIHENFOLGE.indexOf(b[0]) + 1 || 99)
  );
}

export default async function BankPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{ alle?: string }>;
}) {
  await requireContext();
  const { bankId } = await params;
  const { alle } = await searchParams;
  const zeigeAlle = alle === "1";

  const bank = await ladeBank(decodeURIComponent(bankId));
  if (!bank) notFound();

  const sichtbar = zeigeAlle
    ? bank.kriterien
    : bank.kriterien.filter((k) => k.status !== "KEINE_ANGABE");

  const ausschluesse = bank.kriterien.filter((k) => k.status === "NICHT_MACHBAR").length;
  const vorbehalte = bank.kriterien.filter((k) => k.status === "VORBEHALTLICH").length;
  const unbeantwortet = bank.kriterien.filter((k) => k.status === "KEINE_ANGABE").length;

  return (
    <div className="space-y-6">
      <Link
        href="/banken"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Bankensuche
      </Link>

      <PageHeader
        eyebrow="Banken-Wiki"
        title={bank.name}
        subtitle={
          bank.kriterien.length === 0
            ? "Für diese Bank liegt kein Europace-Kriteriencheck vor – nur die Produktübersicht aus dem Europace-Wiki."
            : `${ausschluesse} harte Ausschlüsse · ${vorbehalte} unter Vorbehalt · Abzug vom ${datum(bank.importiertAm)}`
        }
      />

      {KATEGORIE_REIHENFOLGE.map((kat) => {
        const zeilen = sichtbar.filter((k) => k.kategorie === kat);
        if (zeilen.length === 0) return null;
        return (
          <section key={kat} className="space-y-2">
            <h2 className="text-sm font-semibold">{kat}</h2>
            {zeilen.map((k) => {
              const a = statusAnzeige(k.status);
              return (
                <Card key={k.kriterium}>
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-medium">{k.kriterium}</p>
                      <Badge variant={BADGE[a.ton]}>{a.label}</Badge>
                    </div>
                    {k.inhalt && (
                      <div
                        className="prose-sm mt-2 text-sm text-muted-foreground [&_li]:ml-4 [&_li]:list-disc"
                        // Bereits beim Import bereinigt (src/lib/banken/bereinigen.ts).
                        dangerouslySetInnerHTML={{ __html: k.inhalt }}
                      />
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Stand laut Europace: {datum(k.standAm)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        );
      })}

      {bank.merkmale.length > 0 && (
        <section className="space-y-2">
          <div className="border-t pt-5">
            <h2 className="text-sm font-semibold">Produktübersicht</h2>
            <p className="text-sm text-muted-foreground">
              Aus dem Europace-Wiki – eine zweite Quelle neben dem Kriteriencheck, die nur für
              überregionale Anbieter geführt wird. Stand {datum(bank.merkmaleStandAm)}.
            </p>
          </div>
          {MERKMAL_ABSCHNITTE(bank.merkmale).map(([abschnitt, zeilen]) => (
            <div key={abschnitt} className="space-y-2">
              <h3 className="pt-2 text-sm font-medium text-muted-foreground">{abschnitt}</h3>
              {zeilen.map((m) => (
                <Card key={`${m.unterabschnitt}|${m.bezeichnung}`}>
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-medium">{m.bezeichnung}</p>
                      {m.unterabschnitt && <Badge variant="neutral">{m.unterabschnitt}</Badge>}
                    </div>
                    {/* Reiner Text aus dem Wiki – bewusst NICHT als HTML gerendert. */}
                    <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                      {m.wert.trim() || "keine Angabe"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </section>
      )}

      {!zeigeAlle && unbeantwortet > 0 && (
        <Link
          href={`/banken/${encodeURIComponent(bankId)}?alle=1`}
          className="inline-block text-sm underline"
        >
          {unbeantwortet} Kriterien anzeigen, zu denen sich die Bank nicht geäußert hat
        </Link>
      )}
      {zeigeAlle && (
        <Link
          href={`/banken/${encodeURIComponent(bankId)}`}
          className="inline-block text-sm underline"
        >
          Unbeantwortetes ausblenden
        </Link>
      )}
    </div>
  );
}
