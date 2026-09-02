import type { AkteArt } from "@/lib/domain/enums";

/**
 * Der Vertriebsfilter fuer jede org-weite Fallabfrage des Vertriebs.
 *
 * Seit dem 02.09.2026 tragen Faelle eine Aktenart: Backoffice-Auftraege
 * legen eine Akte mit `akteArt = backoffice` an, die kein Lead ist und in
 * keiner Vertriebsliste, keiner Kennzahl und keiner Tagesliste auftauchen
 * darf. Jede Abfrage, die "alle Faelle der Organisation" meint, meint in
 * Wahrheit "alle Vertriebsfaelle" - und muss diesen Filter tragen.
 *
 * Als Objekt zum Spreaden gebaut, damit die Stelle im Code sichtbar bleibt:
 * `where: { organizationId, ...nurVertrieb }`. Ein Vertragstest prueft, dass
 * jede bekannte Vertriebsabfrage den Namen referenziert.
 */
export const nurVertrieb = { akteArt: "vertrieb" as AkteArt } as const;

export const nurBackoffice = { akteArt: "backoffice" as AkteArt } as const;
