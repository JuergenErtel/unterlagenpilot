import { ShieldCheck, UploadCloud, Lock } from "lucide-react";
import { prisma } from "@/lib/db";
import { verifyUploadToken } from "@/lib/security/upload-token";
import { buildChecklistForCase } from "@/lib/checklists/engine";
import { customerUpload, saveCustomerForm } from "@/lib/actions/upload";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CustomerUploadProgress } from "@/components/customer/customer-upload-progress";
import { MARITAL_STATUSES, type PropertyType } from "@/lib/domain/enums";

export const dynamic = "force-dynamic";

export default async function PublicUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyUploadToken(token);
  const link = payload
    ? await prisma.uploadLink.findUnique({
        where: { token },
        include: {
          case: {
            include: {
              applicants: true,
              property: true,
              documents: true,
              customerForm: true,
            },
          },
        },
      })
    : null;

  const now = new Date();
  if (!payload || !link || !link.active || link.expiresAt < now) {
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
    },
    c.documents.map((d) => ({
      documentType: d.documentType,
      reviewStatus: d.reviewStatus,
      readable: d.readable,
    }))
  ).filter((i) => i.customerVisible);

  const doneCount = checklist.filter((i) => i.status === "vorhanden").length;

  const applicant = c.applicants[0];
  const kunde = applicant
    ? [applicant.vorname, applicant.nachname].filter(Boolean).join(" ")
    : "";
  const form = (c.customerForm?.data ?? {}) as Record<string, string>;

  return (
    <main className="min-h-screen bg-muted/30 pb-16">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-ai" />
            <span className="text-base font-semibold">UnterlagenPilot</span>
          </div>
          <span className="text-right text-[11px] leading-tight text-muted-foreground">
            Sicherer Bereich
            <br />
            Jürgen Ertel Baufinanzierung
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
                <ItemStatusBadge status={i.status} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unterlagen hochladen</CardTitle>
            <CardDescription>
              PDF oder Foto – mehrere Dateien gleichzeitig möglich.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={customerUpload.bind(null, token)} className="space-y-4">
              <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-ai/50">
                <UploadCloud className="h-9 w-9 text-muted-foreground" />
                <span className="text-sm font-medium">
                  Dateien auswählen oder hierher ziehen
                </span>
                <span className="text-xs text-muted-foreground">
                  PDF, JPG oder PNG
                </span>
                <input
                  type="file"
                  name="files"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="mt-2 w-full max-w-full text-xs"
                />
              </label>
              <Button type="submit" size="lg" className="w-full">
                Hochladen
              </Button>
            </form>
          </CardContent>
        </Card>

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
            <form
              action={saveCustomerForm.bind(null, token)}
              className="space-y-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  name="vorname"
                  label="Vorname"
                  defaultValue={form.vorname ?? applicant?.vorname ?? ""}
                />
                <Field
                  name="nachname"
                  label="Nachname"
                  defaultValue={form.nachname ?? applicant?.nachname ?? ""}
                />
                <Field
                  name="geburtsdatum"
                  label="Geburtsdatum"
                  type="date"
                  defaultValue={form.geburtsdatum ?? ""}
                />
                <Field
                  name="telefon"
                  label="Telefon"
                  type="tel"
                  defaultValue={form.telefon ?? applicant?.phone ?? ""}
                />
                <Field
                  name="email"
                  label="E-Mail"
                  type="email"
                  defaultValue={form.email ?? applicant?.email ?? ""}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="familienstand">Familienstand</Label>
                  <select
                    id="familienstand"
                    name="familienstand"
                    defaultValue={form.familienstand ?? ""}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">– wählen –</option>
                    {MARITAL_STATUSES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <Field
                  name="beruf"
                  label="Beruf"
                  defaultValue={form.beruf ?? ""}
                />
                <Field
                  name="arbeitgeber"
                  label="Arbeitgeber"
                  defaultValue={form.arbeitgeber ?? ""}
                />
                <Field
                  name="nettoEinkommen"
                  label="Netto/Monat (€)"
                  type="number"
                  defaultValue={form.nettoEinkommen ?? ""}
                />
                <Field
                  name="eigenkapital"
                  label="Eigenkapital (€)"
                  type="number"
                  defaultValue={form.eigenkapital ?? ""}
                />
              </div>
              <Button type="submit" variant="outline" size="lg" className="w-full">
                Angaben speichern
              </Button>
            </form>
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

function ItemStatusBadge({ status }: { status: string }) {
  if (status === "vorhanden")
    return <Badge variant="success">hochgeladen / akzeptiert</Badge>;
  if (status === "unvollstaendig")
    return <Badge variant="warning">bitte erneut hochladen</Badge>;
  if (status === "nicht_aktuell")
    return <Badge variant="warning">bitte aktuelle Version</Badge>;
  return <Badge variant="neutral">fehlt</Badge>;
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} />
    </div>
  );
}
