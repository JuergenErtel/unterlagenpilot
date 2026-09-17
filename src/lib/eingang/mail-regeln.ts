/**
 * Die Regeln, nach denen aus einer weitergeleiteten Mail Unterlagen werden.
 *
 * Bewusst reine Funktionen ohne Postfach und ohne Datenbank: Was eine echte
 * Kundenmail mitbringt (Signaturlogo, Zaehlpixel, namenlose Scans), laesst
 * sich hier ohne Netz durchspielen. Der Abruf selbst steht in mail-abruf.ts.
 */

/**
 * Hoechstzahl Anhaenge, die EINE Mail in den Posteingang legen darf.
 *
 * Nicht gegen boese Absicht - der Absender muss ohnehin freigeschaltet sein
 * (siehe absender.ts) - sondern gegen die Mail mit 40 Einzelseiten, die den
 * Posteingang so zumuellt, dass die wartende Arbeit darin untergeht.
 */
export const MAX_ANHAENGE_JE_MAIL = 20;

/** Unter dieser Groesse ist ein BILD kein Dokument, sondern Zierrat. */
const BILD_MINDESTGROESSE_BYTES = 10_000;

/**
 * Die Absenderadresse aus einem `From`-Kopf, kleingeschrieben.
 *
 * Kleinschreibung, weil der Vergleich mit den freigeschalteten Adressen sonst
 * an "Juergen.Ertel@GMX.de" scheitert - und der Nutzer saehe nur, dass seine
 * Mail spurlos verschwindet.
 */
export function absenderAdresse(from: string | null | undefined): string | null {
  const roh = (from ?? "").trim();
  if (!roh) return null;
  // Zuerst die Form mit Anzeigenamen ("Name <adresse>"), sonst die nackte
  // Adresse. Stehen mehrere da, zaehlt die erste: Ein From-Kopf hat genau
  // einen Urheber, alles Weitere waere geraten.
  const inKlammern = roh.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  if (inKlammern?.[1]) return inKlammern[1].toLowerCase();
  const nackt = roh.match(/[^\s<>,;"]+@[^\s<>,;"]+\.[A-Za-z]{2,}/);
  return nackt ? nackt[0].toLowerCase() : null;
}

/** Ein Anhang, so wie mailparser ihn liefert - nur die Felder, die wir brauchen. */
export interface MailAnhang {
  filename?: string;
  contentType?: string;
  content: Buffer | Uint8Array;
  /** mailparser setzt das fuer Teile, auf die der HTML-Text per cid: verweist. */
  related?: boolean;
}

/**
 * Was von den Anhaengen einer Mail als Unterlage taugt.
 *
 * Zwei Dinge fliegen raus, und beide kosten sonst jeden Tag Handarbeit:
 * das per `cid:` eingebettete Firmenlogo (`related`) und das winzige Bild,
 * das ohne cid-Verweis als normaler Anhang mitkommt (Zaehlpixel, Social-Icon
 * unter der Signatur). Gewogen wird nur bei BILDERN: Eine kleine PDF kann
 * sehr wohl eine einseitige Bescheinigung sein.
 */
export function brauchbareAnhaenge<T extends MailAnhang>(anhaenge: T[]): T[] {
  return anhaenge
    .filter((a) => {
      const groesse = a.content?.byteLength ?? 0;
      if (groesse === 0) return false;
      if (a.related) return false;
      const istBild = (a.contentType ?? "").toLowerCase().startsWith("image/");
      if (istBild && groesse < BILD_MINDESTGROESSE_BYTES) return false;
      return true;
    })
    .slice(0, MAX_ANHAENGE_JE_MAIL);
}

/** Endung je Inhaltstyp fuer den Fall, dass die Mail keinen Namen mitschickt. */
const ENDUNGEN: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heic",
  "image/webp": "webp",
  "image/tiff": "tif",
};

/**
 * Ein Name, unter dem die Datei im Posteingang steht.
 *
 * Ohne Namen stuende dort eine namenlose Zeile, die niemand zuordnen kann -
 * dasselbe Problem wie beim Kurzbefehl (siehe posteingang/route.ts). Und der
 * Ersatzname muss INNERHALB einer Mail eindeutig sein: Drei Scans ohne Namen
 * ergaeben sonst drei identische Zeilen.
 */
export function anhangName(
  filename: string | null | undefined,
  contentType: string | null | undefined,
  index: number
): string {
  const typ = (contentType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  const endung = ENDUNGEN[typ] ?? "dat";
  const roh = (filename ?? "").trim();
  if (roh) {
    return /\.[A-Za-z0-9]{1,8}$/.test(roh) ? roh : `${roh}.${endung}`;
  }
  const stempel = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const nummer = index === 0 ? "" : `-${index + 1}`;
  return `mail_${stempel}${nummer}.${endung}`;
}
