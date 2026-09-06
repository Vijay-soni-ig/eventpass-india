import { useState } from "react";
import { Users, Plus, Mail, MoreHorizontal, Trash2, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { hasExhibitorPermission } from "@/lib/permissions";
import { useBusiness } from "@/hooks/exhibitor/useBusiness";
import {
  useExhibitorMembers,
  useInviteExhibitorMember,
  useUpdateExhibitorMember,
  useRemoveExhibitorMember,
  type ExhibitorRole,
} from "@/hooks/exhibitor/useExhibitorMembers";

// Phase 21D fix: this page previously used the legacy V1
// `/api/team-members` system (hooks/exhibitor/useTeamMembers.ts) — a
// completely different model from the real, tenant-isolated
// ExhibitorMembership system (verified correctly scoped in Phase 21A). Its
// roles didn't even match real exhibitor roles (it showed
// owner/finance/operations/marketing/scanner — the ORGANIZER role set —
// instead of the real owner/admin/staff exhibitor roles), and its invite
// path silently created a brand-new, second ExhibitorBusiness for any
// non-owner caller with none of their own (server/src/routes/teamMembers.ts
// getOwnBusinessId + fallback create) — an accidental-duplicate-business
// bootstrap risk, the same class of defect Phase 21B/21C removed for
// organizer bootstrap. Now wired to the real /api/exhibitor-members API.
const roleLabels: Record<ExhibitorRole, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
};

const roleColors: Record<ExhibitorRole, string> = {
  owner: "bg-primary/20 text-primary",
  admin: "bg-primary/10 text-primary",
  staff: "bg-secondary text-secondary-foreground",
};

const roleDescriptions: Record<ExhibitorRole, string> = {
  owner: "Full access",
  admin: "Manage business, team, and documents",
  staff: "Capture and view leads, view-only elsewhere",
};

const invitableRoles: ExhibitorRole[] = ["admin", "staff"];

export default function TeamRoles() {
  const { user } = useAuth();
  const { data: business } = useBusiness();
  const canManage = hasExhibitorPermission(user?.roles, "exhibitorMember:manage");

  const { data: members = [], isLoading, isError, refetch } = useExhibitorMembers(business?.id);
  const inviteMember = useInviteExhibitorMember(business?.id);
  const updateMember = useUpdateExhibitorMember(business?.id);
  const removeMember = useRemoveExhibitorMember(business?.id);

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ExhibitorRole | "">("");

  const handleInvite = () => {
    if (!inviteEmail || !inviteRole) {
      toast.error("Please enter an email and select a role");
      return;
    }
    inviteMember.mutate(
      { invitedEmail: inviteEmail, role: inviteRole },
      {
        onSuccess: () => {
          toast.success("Invitation created. Note: no email is actually sent yet.");
          setIsInviteOpen(false);
          setInviteEmail("");
          setInviteRole("");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to invite member"),
      }
    );
  };

  const handleRoleChange = (id: string, role: ExhibitorRole) => {
    updateMember.mutate(
      { id, role },
      {
        onSuccess: () => toast.success("Role updated"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update role"),
      }
    );
  };

  const handleRemove = (id: string) => {
    removeMember.mutate(id, {
      onSuccess: () => toast.success("Team member removed"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to remove member"),
    });
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-muted-foreground">Manage who can access your exhibitor workspace</p>
        </div>
        {canManage && (
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as ExhibitorRole)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {invitableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleLabels[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleInvite} disabled={inviteMember.isPending}>
                    {inviteMember.isPending ? "Sending..." : "Send Invite"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Role Permissions Info */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-primary" />
          Role Permissions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries(roleLabels).map(([key, label]) => (
            <div key={key} className={`rounded-lg p-3 ${roleColors[key as ExhibitorRole]}`}>
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs opacity-80 mt-1">{roleDescriptions[key as ExhibitorRole]}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Team Members List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold">Team Members ({members.length})</h3>
        </div>

        {isLoading ? (
          <LoadingState label="Loading team members..." />
        ) : isError ? (
          <ErrorState description="Couldn't load team members." onRetry={() => refetch()} />
        ) : (
          <div className="divide-y divide-border">
            {members.map((member) => (
              <div key={member.id} className="p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-primary font-medium">
                      {(member.invitedEmail ?? "?").slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium flex items-center gap-1">
                      <Mail className="w-3 h-3 text-muted-foreground" />
                      {member.invitedEmail ?? "Unknown"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${roleColors[member.role]}`}>
                    {roleLabels[member.role]}
                  </span>
                  <StatusBadge status={member.status} />
                  {canManage && member.role !== "owner" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {invitableRoles
                          .filter((r) => r !== member.role)
                          .map((role) => (
                            <DropdownMenuItem key={role} onClick={() => handleRoleChange(member.id, role)}>
                              <Edit className="w-4 h-4 mr-2" />
                              Set as {roleLabels[role]}
                            </DropdownMenuItem>
                          ))}
                        <DropdownMenuItem className="text-destructive" onClick={() => handleRemove(member.id)}>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
            {members.length === 0 && <EmptyState icon={Users} title="No team members yet." />}
          </div>
        )}
      </div>
    </div>
  );
}
