import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UserRound, UserPlus, Trash2 } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { editApplicant, addApplicant, removeApplicant } from "@/lib/actions/case-edit";
import { MAX_APPLICANTS } from "@/lib/domain/enums";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MARITAL_STATUSES } from "@/lib/domain/enums";

function isoDate(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export default async function CaseEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireContext();

  const caseRecord = await prisma.case.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { applicants: { orderBy: { position: "asc" } } },
  });

  if (!caseRecord) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={caseRecord.caseNumber}
        title="Kundendaten bearbeiten"
        subtitle="Pflichtangaben ergänzen, damit der Fall einreichungsfähig wird."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${id}`}>
              <ArrowLeft />
              Zur Fallakte
            </Link>
          </Button>
        }
      />

      {caseRecord.applicants.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Für diesen Fall sind noch keine Antragsteller hinterlegt.
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {caseRecord.applicants.map((applicant) => {
          const fehlendesGeburtsdatum = !applicant.geburtsdatum;
          const name =
            [applicant.vorname, applicant.nachname].filter(Boolean).join(" ") ||
            `Antragsteller ${applicant.position}`;
          return (
            <Card key={applicant.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <UserRound className="h-5 w-5 text-muted-foreground" />
                    {name}
                  </CardTitle>
                  {fehlendesGeburtsdatum && (
                    <Badge variant="destructive">Pflichtfeld fehlt</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <CardDescription>
                    Antragsteller {applicant.position}
                  </CardDescription>
                  {caseRecord.applicants.length > 1 ? (
                    <form action={removeApplicant.bind(null, applicant.id)}>
                      <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" /> Entfernen
                      </Button>
                    </form>
                  ) : null}
                </div>
              </CardHeader>
              <form action={editApplicant.bind(null, applicant.id)}>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`vorname-${applicant.id}`}>Vorname</Label>
                    <Input
                      id={`vorname-${applicant.id}`}
                      name="vorname"
                      defaultValue={applicant.vorname ?? ""}
                      placeholder="Vorname"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`nachname-${applicant.id}`}>Nachname</Label>
                    <Input
                      id={`nachname-${applicant.id}`}
                      name="nachname"
                      defaultValue={applicant.nachname ?? ""}
                      placeholder="Nachname"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`geburtsdatum-${applicant.id}`}>
                      Geburtsdatum
                    </Label>
                    <Input
                      id={`geburtsdatum-${applicant.id}`}
                      name="geburtsdatum"
                      type="date"
                      defaultValue={isoDate(applicant.geburtsdatum)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`familienstand-${applicant.id}`}>
                      Familienstand
                    </Label>
                    <select
                      id={`familienstand-${applicant.id}`}
                      name="familienstand"
                      defaultValue={applicant.familienstand ?? ""}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">– wählen –</option>
                      {MARITAL_STATUSES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`email-${applicant.id}`}>E-Mail</Label>
                    <Input
                      id={`email-${applicant.id}`}
                      name="email"
                      type="email"
                      defaultValue={applicant.email ?? ""}
                      placeholder="name@beispiel.de"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`telefon-${applicant.id}`}>Telefon</Label>
                    <Input
                      id={`telefon-${applicant.id}`}
                      name="telefon"
                      type="tel"
                      defaultValue={applicant.phone ?? ""}
                      placeholder="+49 …"
                    />
                  </div>
                </CardContent>
                <CardFooter className="justify-end">
                  <Button type="submit">Speichern</Button>
                </CardFooter>
              </form>
            </Card>
          );
        })}
      </div>

      {caseRecord.applicants.length < MAX_APPLICANTS ? (
        <form action={addApplicant.bind(null, id)}>
          <Button type="submit" variant="outline" className="w-full border-dashed">
            <UserPlus className="h-4 w-4" />
            Zweiten Antragsteller hinzufügen
          </Button>
        </form>
      ) : null}
    </div>
  );
}
