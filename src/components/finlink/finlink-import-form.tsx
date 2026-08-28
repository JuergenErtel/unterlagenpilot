"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importFromFinLink, type FinLinkImportState } from "@/lib/actions/finlink";
import { useFallOeffnen } from "./fall-oeffnen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FinLinkImportForm() {
  const [state, action, pending] = useActionState<FinLinkImportState, FormData>(importFromFinLink, {});
  useFallOeffnen(state.fall?.id);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="finlinkId">FinLink-Vorgangsnummer oder Lead-UUID</Label>
        <Input
          id="finlinkId"
          name="finlinkId"
          placeholder="z. B. 1.865.655 oder 2fffefa7-d105-4750-b50f-4615fa8c3b9b"
          required
        />
      </div>
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {/* Der Weg zum Fall steht sichtbar da, falls das Öffnen nicht greift. */}
      {state.fall ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm" role="status">
          Übernommen.{" "}
          <Link href={`/cases/${state.fall.id}`} className="font-medium underline">
            {state.fall.caseNumber ? `${state.fall.caseNumber} öffnen` : "Fall öffnen"}
          </Link>
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>{pending ? "Import läuft …" : "Import vorbereiten"}</Button>
    </form>
  );
}
