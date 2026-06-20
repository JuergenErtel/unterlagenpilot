import { ShieldCheck, CheckCircle2, Circle, UploadCloud } from "lucide-react";

export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { verifyUploadToken } from "@/lib/security/upload-token";
import { buildChecklistForCase } from "@/lib/checklists/engine";
import { customerUpload, saveCustomerForm } from "@/lib/actions/upload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MARITAL_STATUSES,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  type PropertyType,
  type UsageType,
} from "@/lib/domain/enums";

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
            include: { applicants: true, property: true, documents: true, customerForm: true },
          },
        },
      })
    : null;

  if (!payload || !link || !link.active || link.expiresAt < new Date()) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="max-w-md text-center">
          <CardContent className="p-8">
            <h1 className="text-lg font-semibold">Link ungültig oder abgelaufen</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Bitte fordern Sie bei Ihrem Berater einen neuen Upload-Link an.
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
      propertyType: (c.property?.objektart as PropertyType) ?? undefined,
      usage: (c.property?.nutzung as UsageType) ?? undefined,
      kapitalanlage: c.kapitalanlage,
      applicantCount: c.applicants.length,
    },
    c.documents.map((d) => ({ documentType: d.documentType, reviewStatus: d.reviewStatus, readable: d.readable }))
  ).filter((i) => i.customerVisible); // KEINE internen Bewertungen für den Kunden

  const applicant = c.applicants[0];
  const kunde = applicant ? [applicant.vorname, applicant.nachname].filter(Boolean).join(" ") : "";
  const form = (c.customerForm?.data ?? {}) as Record<string, string>;

  return (
    <main className="min-h-screen bg-muted/30 pb-16">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-2xl px-4 py-5">
          <div className="text-sm font-semibold">Ihre Baufinanzierung – Unterlagen-Upload</div>
          <div className="text-xs text-muted-foreground">Sicherer Bereich · Jürgen Ertel Baufinanzierung</div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-5 px-4 pt-6">
        <Card>
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <p className="text-muted-foreground">
              Ihre Daten werden vertraulich und DSGVO-konform verarbeitet. Bitte laden Sie jeweils die <strong>aktuelle, vollständige</strong> Version hoch (PDF oder Foto).
              Die Auswertung erfolgt KI-gestützt und wird anschließend von Ihrem Berater geprüft.
            </p>
          </CardContent>
        </Card>

        {/* Checkliste (Kundensicht) */}
        <Card>
          <CardHeader><CardTitle className="text-base">Diese Unterlagen werden benötigt</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {checklist.map((i) => {
              const done = i.status === "vorhanden";
              return (
                <div key={i.key} className="flex items-start gap-3 rounded-md border p-3">
                  {done ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" /> : <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" />}
                  <div>
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-muted-foreground">{i.customerDescription}</div>
                    {i.status === "unvollstaendig" && <div className="mt-1 text-xs text-warning">Bitte aktuelle, vollständige Version hochladen.</div>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Upload */}
        <Card>
          <CardHeader><CardTitle className="text-base">Unterlagen hochladen</CardTitle></CardHeader>
          <CardContent>
            <form action={customerUpload.bind(null, token)} className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-primary/50">
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Dateien auswählen oder hierher ziehen</span>
                <span className="text-xs text-muted-foreground">PDF, JPG oder PNG · mehrere Dateien möglich</span>
                <input type="file" name="files" multiple accept=".pdf,.jpg,.jpeg,.png" className="mt-2 text-xs" />
              </label>
              <Button type="submit" className="w-full">Hochladen</Button>
            </form>
          </CardContent>
        </Card>

        {/* Kunden-Erstformular */}
        <Card>
          <CardHeader><CardTitle className="text-base">Ihre Angaben (optional, hilft uns weiter)</CardTitle></CardHeader>
          <CardContent>
            <form action={saveCustomerForm.bind(null, token)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field name="vorname" label="Vorname" defaultValue={form.vorname ?? applicant?.vorname ?? ""} />
                <Field name="nachname" label="Nachname" defaultValue={form.nachname ?? applicant?.nachname ?? ""} />
                <Field name="geburtsdatum" label="Geburtsdatum" type="date" defaultValue={form.geburtsdatum ?? ""} />
                <Field name="telefon" label="Telefon" defaultValue={form.telefon ?? ""} />
                <Field name="email" label="E-Mail" type="email" defaultValue={form.email ?? ""} />
                <div className="space-y-1.5">
                  <Label htmlFor="familienstand">Familienstand</Label>
                  <select id="familienstand" name="familienstand" defaultValue={form.familienstand ?? ""} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">– wählen –</option>
                    {MARITAL_STATUSES.map((m) => (<option key={m} value={m}>{m}</option>))}
                  </select>
                </div>
                <Field name="anzahlKinder" label="Anzahl Kinder" type="number" defaultValue={form.anzahlKinder ?? ""} />
                <div className="space-y-1.5">
                  <Label htmlFor="beschaeftigungsart">Beschäftigungsart</Label>
                  <select id="beschaeftigungsart" name="beschaeftigungsart" defaultValue={form.beschaeftigungsart ?? ""} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">– wählen –</option>
                    {EMPLOYMENT_TYPES.map((e) => (<option key={e} value={e}>{EMPLOYMENT_TYPE_LABELS[e]}</option>))}
                  </select>
                </div>
                <Field name="beruf" label="Beruf" defaultValue={form.beruf ?? ""} />
                <Field name="arbeitgeber" label="Arbeitgeber" defaultValue={form.arbeitgeber ?? ""} />
                <Field name="nettoEinkommen" label="Netto/Monat (€)" type="number" defaultValue={form.nettoEinkommen ?? ""} />
                <Field name="eigenkapital" label="Eigenkapital (€)" type="number" defaultValue={form.eigenkapital ?? ""} />
              </div>
              <Button type="submit" variant="outline" className="w-full">Angaben speichern</Button>
            </form>
          </CardContent>
        </Card>

        <p className="px-1 text-center text-[11px] text-muted-foreground">
          Sie sehen ausschließlich Ihren eigenen Vorgang{kunde ? ` (${kunde})` : ""}. Bei Fragen wenden Sie sich an Ihren Berater.
        </p>
      </div>
    </main>
  );
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
