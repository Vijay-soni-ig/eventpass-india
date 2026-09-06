import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AccessDeniedProps {
  /** Where "Go to your dashboard" should send the user. */
  homePath: string;
}

/**
 * Shown in place (URL unchanged) when RoleRoute's `allow` check fails for a
 * signed-in user. Deliberately generic — it never names the role, permission,
 * or resource involved, so it can't be used to infer whether a given
 * organizer/exhibitor/resource exists (IDOR/BOLA-adjacent info leak). This is
 * UX only: the server independently enforces the same access rules.
 */
const AccessDenied = ({ homePath }: AccessDeniedProps) => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-foreground">Access denied</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          You don't have permission to view this page. If you think this is a mistake, contact your workspace admin.
        </p>
        <Button asChild>
          <Link to={homePath}>Go to your dashboard</Link>
        </Button>
      </div>
    </div>
  );
};

export default AccessDenied;
