import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/forms";
import { getAppContext } from "@/server/auth-context";
import { isSetupRequired } from "@/server/services/auth";

export const metadata = { title: "Log in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Fresh database → create the owner first. Still signed in → straight to Home.
  if (await isSetupRequired()) redirect("/setup");
  if (await getAppContext()) redirect("/");
  return <LoginForm />;
}
