import { Sailboat } from "lucide-react";

export function Logo() {
  return (
    <div className="flex items-center gap-2 text-lg font-semibold text-primary">
      <Sailboat className="h-6 w-6" />
      <span className="group-data-[collapsible=icon]:hidden">HelmLogic</span>
    </div>
  );
}
