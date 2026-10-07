/**
 * Next implementuje `redirect()` a `notFound()` cez vyhodenú výnimku.
 * Ak ju zachytí `catch`, presmerovanie sa stratí a používateľ uvidí nezmyselnú
 * hlášku typu „NEXT_REDIRECT“. Tento helper takú výnimku pustí ďalej.
 *
 * Použitie: `catch (error) { rethrowControlFlow(error); redirect(...) }`
 */
export function rethrowControlFlow(error: unknown) {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const digest = String((error as { digest?: unknown }).digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND") throw error;
  }
}

/** Bezpečný text chyby pre používateľa. */
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Neznáma chyba.";
}
