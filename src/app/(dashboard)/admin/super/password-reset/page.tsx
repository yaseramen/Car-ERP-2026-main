import { auth } from "@/auth";
import { redirect } from "next/navigation";
import SuperPasswordResetClient from "./password-reset-client";

export default async function SuperPasswordResetPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    redirect("/login");
  }
  return <SuperPasswordResetClient />;
}
