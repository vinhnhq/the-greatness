"use server";

import { redirect } from "next/navigation";

import { clearSession } from "@/lib/auth";
import { clearShowcaseSession, isShowcase } from "@/lib/showcase";

export async function signOut(): Promise<void> {
  if (isShowcase()) await clearShowcaseSession();
  else await clearSession();
  redirect("/sign-in");
}
