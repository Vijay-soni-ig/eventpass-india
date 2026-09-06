import { Link } from "react-router-dom";
import {
  Building2,
  CreditCard,
  Users,
  ChevronRight,
  Check,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { useBusiness } from "@/hooks/exhibitor/useBusiness";
import { useExhibitorMembers } from "@/hooks/exhibitor/useExhibitorMembers";

export default function MyBusiness() {
  const { data: business } = useBusiness();
  const { data: members = [] } = useExhibitorMembers(business?.id);

  const profileItems = [
    { label: "Basic Info", done: !!business?.companyName },
    { label: "Address", done: !!business?.address },
    { label: "Tax Details", done: !!business?.gst || !!business?.pan },
    { label: "Logo & Branding", done: !!business?.logoUrl },
    { label: "KYC Documents", done: business?.kycStatus === "verified" },
  ];
  const profileCompletion = Math.round(
    (profileItems.filter((i) => i.done).length / profileItems.length) * 100
  );

  const bankComplete = !!business?.bankAccountNumber && !!business?.bankIfsc;
  const bankCompletion = bankComplete ? 100 : business?.bankAccountNumber ? 50 : 0;

  const activeMembers = members.filter((m) => m.status === "active").length;
  const invitedMembers = members.filter((m) => m.status === "invited").length;

  const businessSections = [
    {
      title: "Company Profile",
      description: "Business information, branding, and KYC documents",
      icon: Building2,
      path: "/exhibitor-dashboard/business/profile",
      status: profileCompletion === 100 ? "complete" : "incomplete",
      completion: profileCompletion,
      items: profileItems,
    },
    {
      title: "Bank Setup",
      description: "Bank account details for payouts",
      icon: CreditCard,
      path: "/exhibitor-dashboard/business/bank",
      status: bankComplete ? "complete" : "incomplete",
      completion: bankCompletion,
    },
    {
      title: "Team & Roles",
      description: "Manage team members and their access permissions",
      icon: Users,
      path: "/exhibitor-dashboard/business/team",
      status: "active" as const,
      completion: 100,
      stats: { total: members.length, active: activeMembers, invited: invitedMembers },
    },
  ];

  const overallCompletion = Math.round(
    businessSections.reduce((acc, s) => acc + s.completion, 0) / businessSections.length
  );

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">My Business</h1>
        <p className="text-muted-foreground">Manage your company profile, banking, and team</p>
      </div>

      {/* Overall Progress Card */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <ProgressRing value={overallCompletion} size={120} />
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-xl font-semibold mb-2">Business Setup Progress</h2>
            <p className="text-muted-foreground mb-4">
              {overallCompletion === 100
                ? "Great! Your business profile is complete. You can now receive payouts."
                : "Complete your business profile to unlock all features including payouts."}
            </p>
            <div className="flex flex-wrap gap-4 justify-center md:justify-start">
              <div className="flex items-center gap-2 text-sm">
                <div className={cn("w-2 h-2 rounded-full", profileCompletion === 100 ? "bg-success" : "bg-warning")} />
                <span>Profile: {profileCompletion === 100 ? "complete" : "incomplete"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className={cn("w-2 h-2 rounded-full", bankComplete ? "bg-success" : "bg-warning")} />
                <span>Bank: {bankComplete ? "Verified" : "Pending"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    business?.kycStatus === "verified" ? "bg-success" : "bg-warning"
                  )}
                />
                <span>KYC: {business?.kycStatus ?? "pending"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bank Setup Warning */}
      {!bankComplete && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-foreground">Bank setup incomplete</p>
            <p className="text-sm text-muted-foreground">
              Complete your bank details to enable payouts. All revenue will be held until verification.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/exhibitor-dashboard/business/bank">Complete Bank Setup</Link>
            </Button>
          </div>
        </div>
      )}

      {/* Business Sections */}
      <div className="grid gap-4">
        {businessSections.map((section) => (
          <Link
            key={section.path}
            to={section.path}
            className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <section.icon className="w-6 h-6 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-lg">{section.title}</h3>
                  <div className="flex items-center gap-2">
                    {section.status === "complete" && <StatusBadge status="verified" />}
                    {section.status === "incomplete" && <StatusBadge status="pending" />}
                    {section.status === "active" && section.stats && (
                      <span className="text-sm text-muted-foreground">{section.stats.total} members</span>
                    )}
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
                <p className="text-muted-foreground text-sm mb-4">{section.description}</p>

                {section.items && (
                  <div className="flex flex-wrap gap-3">
                    {section.items.map((item) => (
                      <div
                        key={item.label}
                        className={cn(
                          "flex items-center gap-1.5 text-sm",
                          item.done ? "text-success" : "text-muted-foreground"
                        )}
                      >
                        {item.done ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                        {item.label}
                      </div>
                    ))}
                  </div>
                )}

                {section.stats && (
                  <div className="flex gap-4">
                    <div className="text-sm">
                      <span className="text-success font-medium">{section.stats.active}</span>
                      <span className="text-muted-foreground"> active</span>
                    </div>
                    {section.stats.invited > 0 && (
                      <div className="text-sm">
                        <span className="text-warning font-medium">{section.stats.invited}</span>
                        <span className="text-muted-foreground"> pending invite</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
