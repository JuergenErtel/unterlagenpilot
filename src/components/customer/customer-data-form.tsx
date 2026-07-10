"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCustomerForm, type CustomerFormState } from "@/lib/actions/upload";
import { MARITAL_STATUSES, MARITAL_STATUS_LABELS } from "@/lib/domain/enums";

export interface CustomerFormDefaults {
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  telefon: string;
  email: string;
  familienstand: string;
  beruf: string;
  arbeitgeber: string;
  nettoEinkommen: string;
  eigenkapital: string;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="lg" className="w-full" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Angaben speichern"}
    </Button>
  );
}

export function CustomerDataForm({
  token,
  defaults,
}: {
  token: string;
  defaults: CustomerFormDefaults;
}) {
  const [state, action] = useActionState<CustomerFormState, FormData>(
    saveCustomerForm.bind(null, token),
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="vorname" label="Vorname" defaultValue={defaults.vorname} error={state.fieldErrors?.vorname} />
        <Field name="nachname" label="Nachname" defaultValue={defaults.nachname} error={state.fieldErrors?.nachname} />
        <Field name="geburtsdatum" label="Geburtsdatum" type="date" defaultValue={defaults.geburtsdatum} error={state.fieldErrors?.geburtsdatum} />
        <Field name="telefon" label="Telefon" type="tel" defaultValue={defaults.telefon} error={state.fieldErrors?.telefon} />
        <Field name="email" label="E-Mail" type="email" defaultValue={defaults.email} error={state.fieldErrors?.email} />

        <div className="space-y-1.5">
          <Label htmlFor="familienstand">Familienstand</Label>
          <select
            id="familienstand"
            name="familienstand"
            defaultValue={defaults.familienstand}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">– wählen –</option>
            {MARITAL_STATUSES.map((m) => (
              <option key={m} value={m}>
                {MARITAL_STATUS_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <Field name="beruf" label="Beruf" defaultValue={defaults.beruf} error={state.fieldErrors?.beruf} />
        <Field name="arbeitgeber" label="Arbeitgeber" defaultValue={defaults.arbeitgeber} error={state.fieldErrors?.arbeitgeber} />
        <Field
          name="nettoEinkommen"
          label="Netto/Monat (€)"
          inputMode="numeric"
          placeholder="z. B. 3500"
          defaultValue={defaults.nettoEinkommen}
          error={state.fieldErrors?.nettoEinkommen}
        />
        <Field
          name="eigenkapital"
          label="Eigenkapital (€)"
          inputMode="numeric"
          placeholder="z. B. 60000"
          defaultValue={defaults.eigenkapital}
          error={state.fieldErrors?.eigenkapital}
        />
      </div>

      <SaveButton />

      {state.error ? (
        <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      {state.ok ? (
        <p className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success-foreground" role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Vielen Dank – Ihre Angaben sind gespeichert.
        </p>
      ) : null}
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  inputMode,
  placeholder,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  inputMode?: "numeric" | "decimal";
  placeholder?: string;
  defaultValue?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
      />
      {error ? (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
