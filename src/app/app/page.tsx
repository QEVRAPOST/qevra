import { redirect } from "next/navigation";

/** The Launch App target. The app opens on Simple swap. */
export default function AppIndex() {
  redirect("/app/swap");
}
