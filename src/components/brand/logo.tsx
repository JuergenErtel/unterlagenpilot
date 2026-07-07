import Image from "next/image";

/**
 * BaufiDesk-Wortmarke (Haus-Icon + Schriftzug). Höhe per className steuern
 * (z. B. "h-8 w-auto"); Seitenverhältnis bleibt erhalten.
 */
export function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="BaufiDesk"
      width={1546}
      height={382}
      priority
      className={className}
    />
  );
}

/** Nur das Haus-Icon (quadratisch) – für kompakte Flächen. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <Image src="/icon-mark.png" alt="BaufiDesk" width={512} height={512} className={className} />
  );
}
