"use client";
import { useFormStatus } from "react-dom";
import { Button } from "../ui";

export function SubmitButton({ children, pendingText = "Sedang diproses…", variant, className, name, value }: {
  children: React.ReactNode; pendingText?: string; variant?: "primary" | "secondary" | "danger" | "ghost" | "gold"; className?: string; name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className} name={name} value={value} aria-busy={pending}>
      {pending ? pendingText : children}
    </Button>
  );
}
