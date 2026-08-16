import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent } from "@/components/ui/card";
import { AbsendenFormular } from "@/components/self-disclosure/absenden-formular";
import { resolveSelfDisclosureToken } from "@/lib/security/self-disclosure-link";
import { sichtbareSchritte, personenSchluessel } from "@/lib/self-disclosure/navigation";
import { sichtbareFelder } from "@/lib/self-disclosure/felder";
import { fehlendeKontaktangaben } from "@/lib/self-disclosure/pflichtangaben";
import { umfangDesBogens } from "@/lib/self-disclosure/umfang";
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
    select: { answers: true, submittedAt: true, link: { select: { formularId: true } } },
  });
  const antworten = ((bogen?.answers as Antworten | null) ?? {}) as Antworten;
  const umfang = umfangDesBogens({ formularId: bogen?.link?.formularId ?? null });

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

  const schritte = sichtbareSchritte(antworten, umfang);
  const fehlend = access.caseId === null ? fehlendeKontaktangaben(antworten) : [];
  // `sichtbareFelder` je Spalte, nicht `schritt.felder`: Auf einer gebuendelten
  // Seite gehoert je nach Vorhaben nur ein Teil der Felder zu diesem Bogen.
  // Ungefiltert stuenden hier "Restschuld – noch offen" beim Hauskauf und die
  // Arbeitgeberfragen bei der Selbstaendigen.
  const offen = schritte.reduce(
    (n, s) =>
      n +
      (s.personen ?? [undefined]).reduce(
        (m, person) =>
          m +
          sichtbareFelder(s.schritt, antworten, person).filter((feld) => {
            const v = antworten[personenSchluessel(s.schritt.id, feld.id, person)];
            return v === undefined || v === null || v === "";
          }).length,
        0
      ),
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
              <p className="text-sm font-medium">{s.schritt.frage}</p>
              <Link
                href={`/selbstauskunft/${token}/${s.id}`}
                className="shrink-0 text-xs text-muted-foreground hover:underline"
              >
                ändern
              </Link>
            </div>
            <dl className="mt-2 space-y-1">
              {(s.personen ?? [undefined]).flatMap((person) =>
                sichtbareFelder(s.schritt, antworten, person).map((feld) => {
                  const v = antworten[personenSchluessel(s.schritt.id, feld.id, person)];
                  const leer = v === undefined || v === null || v === "";
                  const label = person ? `${feld.label} (Antragsteller ${person})` : feld.label;
                  return (
                    <div
                      key={`${person ?? "x"}.${feld.id}`}
                      className="flex justify-between gap-3 text-sm"
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className={leer ? "italic text-muted-foreground" : "font-medium"}>
                        {leer ? "noch offen" : String(v)}
                      </dd>
                    </div>
                  );
                })
              )}
            </dl>
          </div>
        ))}
      </div>

      <AbsendenFormular token={token} zeigeKontaktblock={access.caseId === null} fehlend={fehlend} />
    </main>
  );
}
