import { redirect } from "next/navigation";
import { SetupOwnerForm } from "@/components/auth/forms";
import { isSetupRequired } from "@/server/services/auth";

export const metadata = { title: "Create owner account" };
export const dynamic = "force-dynamic";

/** First-run only: closed for good once an owner exists (also enforced in the action). */
export default async function SetupPage() {
  if (!(await isSetupRequired())) redirect("/login");
  return <SetupOwnerForm />;
}
