import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Not found"
      description="This page or record doesn’t exist, or belongs to another salon."
      action={<Link href="/" className="font-medium text-rose">Back to Home</Link>}
    />
  );
}
