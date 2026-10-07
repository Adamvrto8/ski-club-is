"use client";

import { useState } from "react";

/**
 * Pole na heslo s prepínačom „Zobraziť“. Na telefóne sa heslo píše naslepo a
 * preklep sa ukáže až neúspešným prihlásením — pri novom hesle až nesúhlasným
 * zopakovaním. Východzí stav je vždy skryté, nech sa heslo neukáže samo od seba.
 */
export function PasswordField({
  label,
  name,
  autoComplete,
  minLength,
}: {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}) {
  const [shown, setShown] = useState(false);

  return (
    <label>
      {label}
      <span className="password-input">
        <input
          required
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
        />
        {/* type="button" — inak by klik na prepínač odoslal formulár. */}
        <button
          type="button"
          className="text-link"
          onClick={() => setShown((current) => !current)}
          aria-pressed={shown}
          aria-label={shown ? "Skryť heslo" : "Zobraziť heslo"}
        >
          {shown ? "Skryť" : "Zobraziť"}
        </button>
      </span>
    </label>
  );
}
