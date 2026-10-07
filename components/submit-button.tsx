"use client";

import type { MouseEvent } from "react";
import { useFormStatus } from "react-dom";

/**
 * Počas odosielania sa tlačidlo zablokuje — chráni pred dvojklikom,
 * ktorý by inak spustil ten istý import alebo predpis dvakrát.
 */
export function SubmitButton({
  label,
  pendingLabel,
  className,
  name,
  value,
  onClick,
  disabled,
}: {
  label: string;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} name={name} value={value} disabled={pending || disabled} onClick={onClick}>
      {pending ? (pendingLabel ?? "Pracujem…") : label}
    </button>
  );
}
