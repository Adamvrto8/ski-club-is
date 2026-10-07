import { redirect } from "next/navigation";

/** Vstupný bod. O prípadné presmerovanie na prihlásenie sa postará `getSession()`. */
export default function Home() {
  redirect("/prehlad");
}
