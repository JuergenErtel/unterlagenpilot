import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Knoepfe sind Werkzeuge, keine Flaechen: enge Laufweite, praezise Kanten,
  // Bewegung nur in Farbe und Hoehe – nie in Groesse.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-medium tracking-[-0.005em] ring-offset-background transition-[background-color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Die Stempelfarbe. Bewusst nur EINE Hauptaktion je Seite.
        default:
          "bg-primary text-primary-foreground hover:bg-primary/92 active:bg-primary shadow-[0_1px_0_hsl(var(--primary)/0.9),0_1px_2px_hsl(220_24%_12%/0.18)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/92 shadow-[0_1px_2px_hsl(220_24%_12%/0.14)]",
        // Der Regelfall im Alltag: Kante statt Flaeche.
        outline:
          "border border-input bg-card hover:border-foreground/25 hover:bg-accent/60",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        success: "bg-success text-success-foreground hover:bg-success/92",
        warning: "bg-warning text-warning-foreground hover:bg-warning/92",
        ai: "bg-ai text-ai-foreground hover:bg-ai/92",
        ghost: "hover:bg-accent/70",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-2.5 text-xs",
        lg: "h-11 px-6 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
