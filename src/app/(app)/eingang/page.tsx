import Link from "next/link";
import { Inbox, Smartphone } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext, eigeneAkteWhere } from "@/lib/auth/context";
import { listeEingang } from "@/lib/eingang/service";
import { listeStapel } from "@/lib/sortierer/service";
import { nurSortierung } from "@/lib/cases/aktenart";
import { ladeBereiche } from "@/lib/backoffice/zugriff";
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

  const [dateien, faelle, stapel, bereiche] = await Promise.all([
    listeEingang(ctx.organizationId),
    prisma.case.findMany({
      where: {
        ...eigeneAkteWhere(ctx),
        // Sortierstapel stehen in einer EIGENEN Gruppe (siehe unten). Ohne
        // diesen Ausschluss stuenden sie unbeschriftet zwischen den Faellen -
        // seit sie durch eigeneAkteWhere kommen, waere das still passiert.
        NOT: { ...nurSortierung },
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
    listeStapel(ctx.organizationId),
    ladeBereiche(ctx),
  ]);

  const auswahl = faelle.map((f) => {
    const a = f.applicants[0];
    const name = [a?.vorname, a?.nachname].filter(Boolean).join(" ");
    return { id: f.id, bezeichnung: name ? `${f.caseNumber} · ${name}` : f.caseNumber };
  });
  const stapelAuswahl = stapel.map((s) => ({ id: s.id, bezeichnung: `${s.nummer} · ${s.name}` }));

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
    quelle: d.quelle,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Arbeit"
        title="Posteingang"
        subtitle="Was du vom Handy geteilt oder per Mail weitergeleitet hast, wartet hier – bis du sagst, zu welchem Fall es gehört."
      />

      {anzeige.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
              <span className="font-medium">Nichts wartet.</span>
            </div>
            <p className="max-w-2xl">
              Hier landen Unterlagen, die dir der Kunde woanders geschickt hat:
              per Kurzbefehl vom iPhone geteilt (etwa aus WhatsApp) oder als
              Mail an die BaufiDesk-Adresse weitergeleitet. Du ordnest sie dann
              mit einem Klick dem richtigen Fall zu; ab da laufen sie durch
              dieselbe Prüfung wie jeder andere Upload.
            </p>
            <Button variant="outline" asChild>
              <Link href="/connections">
                <Smartphone className="mr-2 h-4 w-4" aria-hidden />
                Wege einrichten
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Der Hinweis gilt nur noch, wenn es WIRKLICH kein Ziel gibt.
              Solange ein neuer Sortierstapel moeglich ist, gibt es immer eines -
              und fuer den Sortierer-Nutzer ohne Faelle ist genau das der Weg. */}
          {auswahl.length === 0 && stapelAuswahl.length === 0 && !bereiche.sortierer && (
            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="p-4 text-sm">
                Es gibt noch keinen offenen Fall, dem du etwas zuordnen könntest.
                Lege zuerst einen Fall an – die Dateien warten so lange hier.
              </CardContent>
            </Card>
          )}
          <PosteingangListe
            dateien={anzeige}
            faelle={auswahl}
            stapel={stapelAuswahl}
            neuerStapelMoeglich={bereiche.sortierer}
          />
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
