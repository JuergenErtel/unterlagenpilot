import { Lock } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { prisma } from "@/lib/db";
import { resolveUploadToken } from "@/lib/auth/context";
import { buildChecklistForCase } from "@/lib/checklists/engine";
import { maxUploadMb } from "@/lib/documents/pipeline";
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
import { CustomerDataForm } from "@/components/customer/customer-data-form";
import { type PropertyType } from "@/lib/domain/enums";

export const dynamic = "force-dynamic";

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
  const checklist = buildChecklistForCase(
    {
      financingType: c.financingType ?? undefined,
      propertyType: (c.property?.objektart as PropertyType | undefined) ?? undefined,
      kapitalanlage: c.kapitalanlage,
      applicantCount: c.applicants.length,
      applicantIds: c.applicants
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((a) => a.id),
    },
    c.documents.map((d) => ({
      documentType: d.documentType,
      reviewStatus: d.reviewStatus,
      readable: d.readable,
      applicantId: d.applicantId,
    }))
  ).filter((i) => i.customerVisible);

  const doneCount = checklist.filter((i) => i.status === "vorhanden").length;

  const applicant = c.applicants[0];
  const kunde = applicant
    ? [applicant.vorname, applicant.nachname].filter(Boolean).join(" ")
    : "";
  const form = (c.customerForm?.data ?? {}) as Record<string, string>;
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

        <CustomerUploadProgress done={doneCount} total={checklist.length} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Diese Unterlagen brauchen wir</CardTitle>
            <CardDescription>
              Laden Sie bitte jeweils die aktuelle, vollständige Version hoch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {checklist.length === 0 && (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Aktuell sind keine offenen Unterlagen hinterlegt. Ihr Berater
                meldet sich, falls noch etwas benötigt wird.
              </p>
            )}
            {checklist.map((i) => (
              <div
                key={i.key}
                className="flex items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{i.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.customerDescription}
                  </div>
                </div>
                <ItemStatusBadge status={i.status} matchedDocuments={i.matchedDocuments} />
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Ihre Angaben (optional, hilft uns weiter)
            </CardTitle>
            <CardDescription>
              Je vollständiger, desto schneller geht es voran.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerDataForm
              token={token}
              defaults={{
                vorname: form.vorname ?? applicant?.vorname ?? "",
                nachname: form.nachname ?? applicant?.nachname ?? "",
                geburtsdatum: form.geburtsdatum ?? "",
                telefon: form.telefon ?? applicant?.phone ?? "",
                email: form.email ?? applicant?.email ?? "",
                familienstand: form.familienstand ?? applicant?.familienstand ?? "",
                beruf: form.beruf ?? "",
                arbeitgeber: form.arbeitgeber ?? "",
                nettoEinkommen: form.nettoEinkommen != null ? String(form.nettoEinkommen) : "",
                eigenkapital: form.eigenkapital != null ? String(form.eigenkapital) : "",
              }}
            />
          </CardContent>
        </Card>

        <p className="px-2 pt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          Sie sehen ausschließlich Ihren eigenen Vorgang. Ihre Daten werden
          DSGVO-konform verarbeitet.
        </p>
      </div>
    </main>
  );
}

function ItemStatusBadge({
  status,
  matchedDocuments,
}: {
  status: string;
  matchedDocuments: number;
}) {
  if (status === "vorhanden")
    return <Badge variant="success">hochgeladen / akzeptiert</Badge>;
  if (status === "unvollstaendig") {
    // Es liegen bereits Dateien vor – sie sind nur noch nicht geprüft bzw. der
    // Person zugeordnet (bei zwei Antragstellern weiß die App nicht, wer
    // hochgeladen hat). "Bitte erneut hochladen" wäre hier schlicht falsch.
    return matchedDocuments > 0 ? (
      <Badge variant="neutral">eingegangen, wird geprüft</Badge>
    ) : (
      <Badge variant="warning">bitte erneut hochladen</Badge>
    );
  }
  if (status === "nicht_aktuell")
    return <Badge variant="warning">bitte aktuelle Version</Badge>;
  return <Badge variant="neutral">fehlt</Badge>;
}

