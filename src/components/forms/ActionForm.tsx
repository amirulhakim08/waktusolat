"use client";
import { useActionState, useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/errors";
import { Alert } from "../ui";

/**
 * Wraps a server action form with success/error feedback.
 * The action receives (prevState, formData).
 */
export function ActionForm({ action, children, className, confirm, resetOnSuccess }: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state && !state.ok && <div className="mt-3"><Alert tone="error">{state.error}</Alert></div>}
      {state?.ok && state.message && <div className="mt-3"><Alert tone="success">{state.message}</Alert></div>}
    </form>
  );
}
