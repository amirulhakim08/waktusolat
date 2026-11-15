import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";

/** Sends a freshly signed-in user to the right dashboard for their role. */
export const dynamic = "force-dynamic";

export default async function RouteByRole() {
  const { profile } = await getSession();
  redirect(await homeFor(profile));
}
