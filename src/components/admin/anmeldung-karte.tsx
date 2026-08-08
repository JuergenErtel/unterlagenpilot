import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDate } from "@/lib/utils";
import { freigebenAction, ablehnenAction } from "@/lib/actions/freigabe-actions";
import { PLAN_DEFINITIONS } from "@/lib/saas/plans";
import { PLAN_TIERS, type PlanTier } from "@/lib/domain/enums";

export interface AnmeldungKarteAntrag {
  id: string;
  firmenname: string;
  name: string;
  email: string;
  telefon: string | null;
  wunschtarif: PlanTier | null;
  ablehnungsgrund: string | null;
  createdAt: string;
}

/**
 * Eine wartende Anmeldung: Antragsdaten links, Entscheidung rechts.
 *
 * Server-Komponente – die beiden Formulare rufen Server Actions direkt auf,
 * ein Client-Bundle ist dafür nicht nötig.
 */
export function AnmeldungKarte({ antrag }: { antrag: AnmeldungKarteAntrag }) {
  const vorbelegterTarif: PlanTier = antrag.wunschtarif ?? "starter";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">{antrag.firmenname}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {antrag.name} · {antrag.email}
          </p>
        </div>
        <Badge variant="neutral">Eingang {formatDate(antrag.createdAt)}</Badge>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {/* Antragsdaten */}
        <dl className="space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted-foreground">Firma</dt>
            <dd>{antrag.firmenname}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted-foreground">Name</dt>
            <dd>{antrag.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted-foreground">E-Mail</dt>
            <dd>{antrag.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted-foreground">Telefon</dt>
            <dd>{antrag.telefon ?? "keine Angabe"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted-foreground">Wunschtarif</dt>
            <dd>{antrag.wunschtarif ? PLAN_DEFINITIONS[antrag.wunschtarif].name : "keine Angabe"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted-foreground">Eingang</dt>
            <dd>{formatDate(antrag.createdAt)}</dd>
          </div>

          {antrag.ablehnungsgrund ? (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-[hsl(var(--warning))]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{antrag.ablehnungsgrund}</p>
            </div>
          ) : null}
        </dl>

        {/* Entscheidung */}
        <div className="space-y-4 border-t pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
          <form action={freigebenAction} className="space-y-3">
            <input type="hidden" name="requestId" value={antrag.id} />
            <div className="space-y-1.5">
              <Label htmlFor={`tier-${antrag.id}`}>Tarif</Label>
              <select
                id={`tier-${antrag.id}`}
                name="tier"
                defaultValue={vorbelegterTarif}
                className="feld h-9 w-full"
              >
                {PLAN_TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {PLAN_DEFINITIONS[tier].name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`testtage-${antrag.id}`}>Testzeitraum (Tage)</Label>
              <Input id={`testtage-${antrag.id}`} name="testTage" type="number" min={1} max={365} defaultValue={30} />
            </div>
            <SubmitButton variant="success" pendingLabel="Wird freigegeben …" className="w-full">
              Freigeben
            </SubmitButton>
          </form>

          <form action={ablehnenAction} className="space-y-3">
            <input type="hidden" name="requestId" value={antrag.id} />
            <div className="space-y-1.5">
              <Label htmlFor={`grund-${antrag.id}`}>Ablehnungsgrund</Label>
              <Input id={`grund-${antrag.id}`} name="grund" placeholder="z. B. unplausible Angaben" />
            </div>
            <SubmitButton variant="destructive" pendingLabel="Wird abgelehnt …" className="w-full">
              Ablehnen
            </SubmitButton>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
