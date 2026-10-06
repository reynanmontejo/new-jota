"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"
import { disconnectGoogleDrive } from "@/lib/storage/google-drive"

export async function disconnectDriveAction() {
  const actor = await getStorageActor()
  if (!actor) redirect("/login")
  if (!await hasStoragePermission(actor, ["storage.manage"])) redirect("/settings/storage?drive=access-denied")
  try { await disconnectGoogleDrive(actor.organizationId) } catch { redirect("/settings/storage?drive=disconnect-failed") }
  revalidatePath("/settings/storage")
  redirect("/settings/storage?drive=disconnected")
}
