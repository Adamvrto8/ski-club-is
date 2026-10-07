"use server";

import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/data";
import { MIN_PASSWORD } from "@/lib/password";
import { createClient } from "@/lib/supabase/server";

/**
 * Zmena hesla prihláseného používateľa.
 *
 * Pýtame aj súčasné heslo: inak by stačilo nájsť odomknutý telefón alebo
 * počítač s otvorenou appkou a heslo by sa dalo zmeniť bez vedomia majiteľa.
 */
export async function changePassword(formData: FormData) {
  const fail = (message: string) => redirect("/ucet?error=" + encodeURIComponent(message));
  if (isDemoMode()) fail("Vo vývojovom náhľade sa heslá nepoužívajú.");

  const current = String(formData.get("current_password") ?? "");
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("password_repeat") ?? "");

  if (password.length < MIN_PASSWORD) fail(`Nové heslo musí mať aspoň ${MIN_PASSWORD} znakov.`);
  if (password !== repeat) fail("Nové heslá sa nezhodujú.");
  if (password === current) fail("Nové heslo je rovnaké ako súčasné.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/prihlasenie");

  const check = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (check.error) fail("Súčasné heslo nesedí.");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) fail(`Heslo sa nepodarilo zmeniť: ${error.message}`);

  redirect("/ucet?success=" + encodeURIComponent("Heslo je zmenené. Nabudúce sa prihlás novým."));
}
