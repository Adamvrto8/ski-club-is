/** Jednotná spätná väzba po každej akcii — žiadne tiché uloženie ani tichý import. */
export function Notices({ success, error }: { success?: string; error?: string }) {
  if (!success && !error) return null;
  return (
    <>
      {success && <p className="notice">✓ {success}</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
    </>
  );
}
