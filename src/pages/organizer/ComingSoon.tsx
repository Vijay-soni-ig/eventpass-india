import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function ComingSoon({ icon, title, description }: ComingSoonProps) {
  return (
    <div className="py-8">
      <EmptyState icon={icon} title={title} description={description} />
    </div>
  );
}
