import Link from "next/link";
import { Inbox, Smartphone } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext, eigeneAkteWhere } from "@/lib/auth/context";
import { listeEingang } from "@/lib/eingang/service";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PosteingangListe } from "@/components/eingang/posteingang-liste";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Der Posteingang: Dateien, die per Kurzbefehl vom Handy kamen und noch zu
 * keinem Fall gehoeren. Eine Frage je Zeile - in welche Akte?
 */
export default async function EingangPage() {
  const ctx = await requireContext();

  const [dateien, faelle] = await Promise.all([
    listeEingang(ctx.organizationId),
    prisma.case.findMany({
      where: {
        ...eigeneAkteWhere(ctx),
        status: { notIn: ["abgeschlossen", "archiviert"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        caseNumber: true,
        applicants: { orderBy: { position: "asc" }, take: 1, select: { vorname: true, nachname: true } },
      },
    }),
  ]);

  const auswahl = faelle.map((f) => {
    const a = f.applicants[0];
    const name = [a?.vorname, a?.nachname].filter(Boolean).join(" ");
    return { id: f.id, bezeichnung: name ? `${f.caseNumber} · ${name}` : f.caseNumber };
  });

  const anzeige = dateien.map((d) => ({
    id: d.id,
    originalName: d.originalName,
    mimeType: d.mimeType,
    groesse: groesseDe(d.sizeBytes),
    angekommen: d.createdAt.toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    von: d.von,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Arbeit"
        title="Posteingang"
        subtitle="Was du vom Handy geteilt hast, wartet hier – bis du sagst, zu welchem Fall es gehört."
      />

      {anzeige.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
              <span className="font-medium">Nichts wartet.</span>
            </div>
            <p className="max-w-2xl">
              Hier landen Dateien, die du per Kurzbefehl vom iPhone teilst – etwa
              Unterlagen, die dir jemand über WhatsApp geschickt hat. Du ordnest
              sie dann mit einem Klick dem richtigen Fall zu; ab da laufen sie
              durch dieselbe Prüfung wie jeder andere Upload.
            </p>
            <Button variant="outline" asChild>
              <Link href="/connections">
                <Smartphone className="mr-2 h-4 w-4" aria-hidden />
                Kurzbefehl einrichten
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {auswahl.length === 0 && (
            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="p-4 text-sm">
                Es gibt noch keinen offenen Fall, dem du etwas zuordnen könntest.
                Lege zuerst einen Fall an – die Dateien warten so lange hier.
              </CardContent>
            </Card>
          )}
          <PosteingangListe dateien={anzeige} faelle={auswahl} />
        </>
      )}
    </div>
  );
}

/** Dateigroesse in einer Form, die man im Vorbeigehen liest. */
function groesseDe(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1).replace(".", ",")} MB`;
}
