"use client";

import { useTransition } from "react";
import { BellRing, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { wiedervorlageMailUmschalten } from "@/lib/actions/benachrichtigungen";
import type { Benachrichtigungsstand } from "@/lib/actions/benachrichtigungen";

/**
 * Persoenlicher Schalter fuer die taegliche Wiedervorlage-Mail (7 Uhr).
 * Gilt nur fuer den angemeldeten Nutzer – Kollegen bekommen ihre Mail weiter.
 */
export function BenachrichtigungenKarte({ stand }: { stand: Benachrichtigungsstand }) {
  const [pending, startTransition] = useTransition();
  const an = stand.wiedervorlageMail;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {an ? (
            <BellRing className="h-5 w-5 text-muted-foreground" />
          ) : (
            <BellOff className="h-5 w-5 text-muted-foreground" />
          )}
          Tägliche Wiedervorlage-Mail
          <Badge variant={an ? "secondary" : "outline"}>{an ? "an" : "aus"}</Badge>
        </CardTitle>
        <CardDescription>
          Morgens um 7 Uhr eine Mail mit den Fällen, bei denen der Kunde seit
          Tagen nichts mehr hochgeladen hat.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {an
            ? "Sie bekommen die Liste jeden Morgen per Mail. Die Fälle stehen genauso in der Tagesliste."
            : "Sie bekommen keine Mail mehr. Die überfälligen Fälle stehen weiter in der Tagesliste – es geht nichts verloren."}
        </p>
        <form action={() => startTransition(() => wiedervorlageMailUmschalten())}>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {an ? "Mail abbestellen" : "Mail wieder bestellen"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Gilt nur für Ihr Konto. Kollegen in derselben Organisation
          entscheiden das für sich.
        </p>
      </CardContent>
    </Card>
  );
}
