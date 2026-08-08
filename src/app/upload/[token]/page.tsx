import { Lock } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { prisma } from "@/lib/db";
import { resolveUploadToken } from "@/lib/auth/context";
import { buildChecklistForCase } from "@/lib/checklists/engine";
import { checklistEingabeFuerFall } from "@/lib/checklists/case-input";
import {
  baueKundenfortschritt,
  fehlmengeHinweis,
  type KundenPosition,
} from "@/lib/upload/kundenansicht";
import { maxUploadMb } from "@/lib/documents/pipeline";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CustomerUploadProgress } from "@/components/customer/customer-upload-progress";
import { CustomerUploadForm } from "@/components/customer/customer-upload-form";

export const dynamic = "force-dynamic";
// Headroom für die Hintergrund-Verarbeitung (OCR/KI) der Kunden-Upload-Actions,
// die per after() nach der Antwort weiterläuft.
export const maxDuration = 300;

export default async function PublicUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Bewusst `resolveUploadToken` (ohne Kontingent-Prüfung): ist das Limit
  // erreicht, soll der Kunde weiterhin seinen Stand sehen und Angaben ergänzen
  // können – statt einer irreführenden "Link ungültig"-Seite.
  const access = await resolveUploadToken(token);
  const link = access
    ? await prisma.uploadLink.findUnique({
        where: { id: access.linkId },
        include: {
          case: {
            include: {
              organization: { select: { name: true } },
              applicants: true,
              property: true,
              documents: true,
              customerForm: true,
            },
          },
        },
      })
    : null;

  if (!access || !link) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <Card className="max-w-md text-center">
          <CardContent className="space-y-3 p-8">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h1 className="text-lg font-semibold">Link ungültig oder abgelaufen</h1>
            <p className="text-sm text-muted-foreground">
              Dieser Upload-Link ist nicht mehr gültig. Bitte fordern Sie bei
              Ihrem Berater einen neuen, sicheren Link an – dann können Sie Ihre
              Unterlagen wie gewohnt hochladen.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const c = link.case;
  // Dieselbe Eingabe wie Vermittlersicht und Erstkontakt – sonst verlangt die
  // Mail andere Unterlagen als die Seite, auf die sie verlinkt.
  const checklistEingabe = checklistEingabeFuerFall(c);
  const checklist = buildChecklistForCase(
    checklistEingabe,
    c.documents.map((d) => ({
      documentType: d.documentType,
      reviewStatus: d.reviewStatus,
      readable: d.readable,
      applicantId: d.applicantId,
    }))
  );

  // Übersetzt den internen Stand in das, was der Kunde sehen soll: eigene
  // Zustände (offen/eingegangen/angenommen/abgelehnt) statt reviewStatus, und
  // nur Positionen, die ihn etwas angehen.
  const fortschritt = baueKundenfortschritt({
    positionen: checklist,
    dokumente: c.documents.map((d) => ({
      documentType: d.documentType,
      reviewStatus: d.reviewStatus,
      reviewNote: d.reviewNote,
      createdAt: d.createdAt,
      applicantId: d.applicantId,
    })),
    applicantIds: checklistEingabe.applicantIds,
  });

  const applicant = c.applicants[0];
  const kunde = applicant
    ? [applicant.vorname, applicant.nachname].filter(Boolean).join(" ")
    : "";
  const beraterName = c.organization?.name || "Ihr Finanzierungsberater";

  // Ist das Upload-Kontingent erschöpft, bleibt die Seite lesbar – nur der
  // Upload-Bereich wird gesperrt.
  const uploadsExhausted = link.maxUploads != null && link.usedCount >= link.maxUploads;

  // Was der Kunde bereits eingereicht hat (nicht verworfene Dateien), damit er
  // sieht, dass sein Upload angekommen ist – auch wenn die Checkliste noch
  // "fehlt" zeigt, weil die Zuordnung erst nach der Prüfung feststeht.
  const eingereicht = c.documents
    .filter((d) => d.uploadSource === "kunde" && d.reviewStatus !== "abgelehnt")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <main className="min-h-screen bg-muted/30 pb-16">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-4">
          <Logo className="h-7 w-auto" />
          <span className="text-right text-[11px] leading-tight text-muted-foreground">
            Sicherer Bereich
            <br />
            {beraterName}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-5 px-4 pt-6">
        <div>
          <h1 className="text-xl font-semibold">
            {kunde ? `Hallo ${kunde},` : "Herzlich willkommen,"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            schön, dass Sie da sind. Laden Sie hier Schritt für Schritt Ihre
            Unterlagen hoch – Sie können jederzeit pausieren und später
            fortfahren.
          </p>
        </div>

        <CustomerUploadProgress
          angenommen={fortschritt.erledigt}
          eingereicht={fortschritt.eingereicht}
          gesamt={fortschritt.gesamt}
          segmente={fortschritt.positionen.map((p) => ({
            zustand: p.zustand,
            name: p.name,
          }))}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Diese Unterlagen brauchen wir</CardTitle>
            <CardDescription>
              Laden Sie bitte jeweils die aktuelle, vollständige Version hoch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {fortschritt.gesamt === 0 && (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Aktuell sind keine offenen Unterlagen hinterlegt. Ihr Berater
                meldet sich, falls noch etwas benötigt wird.
              </p>
            )}
            {fortschritt.positionen.map((p) => (
              <div key={p.key} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{p.name}</div>
                    {/* Wer die Position schon geschafft hat, braucht die
                        Anleitung nicht mehr – Beschreibung und Beispiel
                        blenden wir dann aus, damit die Liste knapp bleibt. */}
                    {p.zustand !== "angenommen" && (
                      <>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {p.beschreibung}
                        </p>
                        {p.beispiel && (
                          <p className="mt-1 text-[11px] text-muted-foreground/70">
                            Beispiel: {p.beispiel}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <PositionZustand zustand={p.zustand} verlangt={p.verlangt} akzeptiert={p.akzeptiert} />
                </div>
                {p.zustand === "abgelehnt" && p.grund && (
                  <p className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                    {p.grund}
                  </p>
                )}
                {p.zustand === "teilweise" && (
                  <p className="mt-2 rounded-md bg-warning/10 p-2 text-xs text-[hsl(var(--warning))]">
                    {fehlmengeHinweis(p.verlangt, p.akzeptiert)}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unterlagen hochladen</CardTitle>
            <CardDescription>
              PDF oder Foto – mehrere Dateien gleichzeitig möglich. Jede Datei
              wird automatisch auf Sicherheit geprüft.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {uploadsExhausted ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Über diesen Link wurden bereits alle vorgesehenen Dateien
                hochgeladen. Wenn Sie noch etwas nachreichen möchten, melden Sie
                sich kurz bei {beraterName} – Sie erhalten dann einen neuen Link.
              </p>
            ) : (
              <CustomerUploadForm token={token} maxMb={maxUploadMb()} />
            )}
          </CardContent>
        </Card>

        {eingereicht.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Das haben Sie bereits eingereicht</CardTitle>
              <CardDescription>
                Ihre Dateien sind angekommen. Die Zuordnung zur Checkliste oben
                erfolgt, sobald {beraterName} sie geprüft hat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {eingereicht.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{d.originalName}</span>
                  {d.reviewStatus === "akzeptiert" ? (
                    <Badge variant="success">angenommen</Badge>
                  ) : (
                    <Badge variant="neutral">in Prüfung</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/*
          Persönliche Angaben macht der Kunde in der Selbstauskunft. Zwei Wege
          auf dieselben Felder – hier sofort, dort mit Freigabe – wären eine
          Fehlerquelle: Angaben von hier haben die Korrekturen des Vermittlers
          überschrieben.
        */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ihre Angaben</CardTitle>
            <CardDescription>
              Ihre persönlichen Angaben machen Sie in der Selbstauskunft – Ihr Berater hat Ihnen
              dafür einen eigenen Link geschickt. Hier laden Sie nur Ihre Unterlagen hoch.
            </CardDescription>
          </CardHeader>
        </Card>

        <p className="px-2 pt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          Sie sehen ausschließlich Ihren eigenen Vorgang. Ihre Daten werden
          DSGVO-konform verarbeitet.
        </p>
      </div>
    </main>
  );
}

/** Zustandspunkt + Beschriftung je Checklisten-Position, in der Sprache des Kunden. */
function PositionZustand({
  zustand,
  verlangt,
  akzeptiert,
}: {
  zustand: KundenPosition["zustand"];
  verlangt: number;
  akzeptiert: number;
}) {
  const config: Record<KundenPosition["zustand"], { punkt: string; text: string; farbe: string }> = {
    offen: { punkt: "bg-muted-foreground/40", text: "Noch offen", farbe: "text-muted-foreground" },
    eingegangen: { punkt: "bg-ai", text: "Bei uns eingegangen, wird geprüft", farbe: "text-ai" },
    // Nicht alle verlangten Dokumente sind schon da (z. B. erst ein
    // Antragsteller von zweien) – ehrlicher als "offen" (der Kunde hat ja
    // schon etwas geschafft) und ehrlicher als "angenommen" (es fehlt noch was).
    teilweise: {
      punkt: "bg-warning",
      text: `${akzeptiert} von ${verlangt} angenommen`,
      farbe: "text-[hsl(var(--warning))]",
    },
    angenommen: { punkt: "bg-success", text: "Angenommen", farbe: "text-success" },
    abgelehnt: { punkt: "bg-destructive", text: "Bitte erneut hochladen", farbe: "text-destructive" },
  };
  const { punkt, text, farbe } = config[zustand];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-medium", farbe)}>
      <span className={cn("h-2 w-2 rounded-full", punkt)} aria-hidden />
      {text}
    </span>
  );
}

