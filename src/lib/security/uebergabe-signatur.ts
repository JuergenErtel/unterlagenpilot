import { createHmac } from "node:crypto";
import { timingSafeEqualStrings } from "@/lib/security/timing-safe";

/**
 * Signatur der Lead-Uebergabe aus baufivergleicher.de.
 *
 * HMAC-SHA256 ueber den ROHEN Rumpf. Zusaetzlich zum Bearer, nicht statt
 * seiner: Der Bearer weist den Absender aus, die Signatur weist aus, dass
 * genau diese Bytes von ihm stammen. Wer den Rumpf unterwegs aendert, haette
 * sonst freie Hand, solange er den Bearer kennt.
 */
export function signiere(rumpf: string, geheimnis: string): string {
  return `sha256=${createHmac("sha256", geheimnis).update(rumpf, "utf8").digest("hex")}`;
}

const PRAEFIX = "sha256=";

export function signaturStimmt(rumpf: string, kopfzeile: string | null, geheimnis: string): boolean {
  if (!kopfzeile || !kopfzeile.startsWith(PRAEFIX) || kopfzeile.length <= PRAEFIX.length) return false;
  return timingSafeEqualStrings(kopfzeile, signiere(rumpf, geheimnis));
}
