import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveSelfDisclosureToken } from "@/lib/security/self-disclosure-link";
import { sichtbareSchritte, schluessel } from "@/lib/self-disclosure/navigation";
import { fehlendeKontaktangaben, KONTAKT_LABELS } from "@/lib/self-disclosure/pflichtangaben";
import { sendeAb } from "@/lib/actions/self-disclosure";
import type { Antworten } from "@/lib/self-disclosure/types";

export const dynamic = "force-dynamic";

export default async function Zusammenfassung({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const access = await resolveSelfDisclosureToken(token);
  if (!access) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <Card className="max-w-md text-center">
          <CardContent className="space-y-3 p-8">
            <h1 className="text-lg font-semibold">Link ungültig oder abgelaufen</h1>
            <p className="text-sm text-muted-foreground">
              Bitte wenden Sie sich an Ihren Berater – er schickt Ihnen einen neuen Link.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const bogen = await prisma.selfDisclosure.findUnique({
    where: { linkId: access.linkId },
    select: { answers: true, submittedAt: true },
  });
  const antworten = ((bogen?.answers as Antworten | null) ?? {}) as Antworten;

  if (bogen?.submittedAt) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <Card className="max-w-md text-center">
          <CardContent className="space-y-3 p-8">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <h1 className="text-lg font-semibold">Vielen Dank!</h1>
            <p className="text-sm text-muted-foreground">
              Ihre Angaben sind bei Ihrem Berater eingegangen. Fällt Ihnen noch etwas ein, melden
              Sie sich einfach – Sie bekommen dann einen neuen Link.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  async function absenden(formData: FormData) {
    "use server";
    await sendeAb(token, formData);
  }

  const schritte = sichtbareSchritte(antworten);
  const fehlend = access.caseId === null ? fehlendeKontaktangaben(antworten) : [];
  const offen = schritte.reduce(
    (n, s) =>
      n +
      s.schritt.felder.filter((feld) => {
        const v = antworten[schluessel(s.id, feld.id)];
        return v === undefined || v === null || v === "";
      }).length,
    0
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <Logo />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Bitte prüfen Sie Ihre Angaben</h1>
        <p className="text-sm text-muted-foreground">
          {offen > 0
            ? `${offen} Angabe${offen === 1 ? "" : "n"} sind noch offen – das ist kein Problem, Ihr Berater fragt bei Bedarf nach.`
            : "Sie haben alles ausgefüllt."}
        </p>
      </div>

      <div className="space-y-4">
        {schritte.map((s) => (
          <div key={s.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">
                {s.schritt.frage}
                {s.person ? ` (Antragsteller ${s.person})` : ""}
              </p>
              <Link
                href={`/selbstauskunft/${token}/${s.id}`}
                className="shrink-0 text-xs text-muted-foreground hover:underline"
              >
                ändern
              </Link>
            </div>
            <dl className="mt-2 space-y-1">
              {s.schritt.felder.map((feld) => {
                const v = antworten[schluessel(s.id, feld.id)];
                const leer = v === undefined || v === null || v === "";
                return (
                  <div key={feld.id} className="flex justify-between gap-3 text-sm">
                    <dt className="text-muted-foreground">{feld.label}</dt>
                    <dd className={leer ? "italic text-muted-foreground" : "font-medium"}>
                      {leer ? "noch offen" : String(v)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>

      <form action={absenden} className="space-y-4">
        {access.caseId === null && (
          <div className="space-y-3 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Wie erreichen wir Sie?</h2>
            {fehlend.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Diese Angaben brauchen wir, um Ihnen antworten zu können.
              </p>
            )}
            {fehlend.map((k) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={k}>{KONTAKT_LABELS[k]}</Label>
                <Input id={k} name={k} required />
              </div>
            ))}
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="einwilligung" value="ja" required className="mt-0.5 h-4 w-4" />
              <span>
                Ich bin damit einverstanden, dass meine Angaben zur Bearbeitung meiner Anfrage
                gespeichert und verarbeitet werden (
                <a href="/datenschutz" className="underline">
                  Datenschutzerklärung
                </a>
                ).
              </span>
            </label>
          </div>
        )}
        <Button type="submit" size="lg" className="w-full">
          Angaben absenden
        </Button>
      </form>
    </main>
  );
}
