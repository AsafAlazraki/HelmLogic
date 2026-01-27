import { Ship } from "lucide-react";
import Link from "next/link";

export function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center w-full gap-2 text-lg font-semibold text-primary pl-2 group-data-[collapsible=icon]:pl-0 group-data-[collapsible=icon]:justify-center">
      <Ship className="h-6 w-6" />
      <span className="group-data-[collapsible=icon]:hidden">HelmLogic</span>
    </Link>
  );
}
