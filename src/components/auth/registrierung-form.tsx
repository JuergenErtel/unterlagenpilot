"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registriereUndWeiter, type RegistrierungState } from "@/lib/actions/registrierung";
import { PASSWORT_HINWEIS } from "@/lib/auth/passwort-regeln";

/**
 * Die Tarifliste kommt als Prop von der Seite (aus PLAN_DEFINITIONS). Sie hier
 * zu wiederholen hiesse, kundenseitig sichtbare Preise doppelt zu pflegen –
 * nach dem ersten Preiswechsel stuenden im Formular sonst falsche Zahlen.
 */
export interface TarifWahl {
  wert: string;
  label: string;
}

export function RegistrierungForm({ tarife }: { tarife: TarifWahl[] }) {
  const [state, formAction, pending] = useActionState<RegistrierungState, FormData>(
    registriereUndWeiter,
    {}
  );
  const fehler = state.feldFehler ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Ihr Name</Label>
        <Input id="name" name="name" autoComplete="name" required />
        {fehler.name ? <p className="text-sm text-destructive">{fehler.name}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="firmenname">Firma</Label>
        <Input id="firmenname" name="firmenname" autoComplete="organization" required />
        {fehler.firmenname ? <p className="text-sm text-destructive">{fehler.firmenname}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        {fehler.email ? <p className="text-sm text-destructive">{fehler.email}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="telefon">Telefon (freiwillig)</Label>
        <Input id="telefon" name="telefon" type="tel" autoComplete="tel" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="passwort">Passwort</Label>
        <Input id="passwort" name="passwort" type="password" autoComplete="new-password" required />
        <p className="text-xs text-muted-foreground">{PASSWORT_HINWEIS}</p>
        {fehler.passwort ? <p className="text-sm text-destructive">{fehler.passwort}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wunschtarif">Wunschtarif (unverbindlich)</Label>
        <select
          id="wunschtarif"
          name="wunschtarif"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          defaultValue="pro"
        >
          {tarife.map((t) => (
            <option key={t.wert} value={t.wert}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-start gap-2">
        <input id="agb" name="agb" type="checkbox" className="mt-1" />
        <Label htmlFor="agb" className="text-sm font-normal leading-snug">
          Ich habe die <Link href="/agb" className="underline">AGB</Link> und die{" "}
          <Link href="/datenschutz" className="underline">Datenschutzerklärung</Link> gelesen und
          stimme ihnen zu.
        </Label>
      </div>
      {fehler.agb ? <p className="text-sm text-destructive">{fehler.agb}</p> : null}
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Wird gesendet …" : "Registrieren"}
      </Button>
    </form>
  );
}
