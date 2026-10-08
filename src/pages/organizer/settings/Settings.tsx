import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Building2, Lock, LogOut, Monitor, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/apiClient";

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

type AuthSession = {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
};

export default function OrganizerSettings() {
  const { user, updateProfile, changePassword } = useAuth();

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  useEffect(() => {
    let mounted = true;

    api.get<{ sessions: AuthSession[] }>("/api/auth/sessions")
      .then(({ sessions: nextSessions }) => {
        if (mounted) setSessions(nextSessions);
      })
      .catch(() => {
        if (mounted) toast.error("Could not load active sessions");
      })
      .finally(() => {
        if (mounted) setLoadingSessions(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!user) return null;

  const formatSessionDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  const revokeSession = async (id: string) => {
    if (!window.confirm("Sign out this session?")) return;

    setRevokingSession(id);
    try {
      await api.delete(`/api/auth/sessions/${encodeURIComponent(id)}`);
      setSessions((current) => current.filter((session) => session.id !== id));
      toast.success("Session signed out");
    } catch (err) {
      toast.error(errorMessage(err, "Could not sign out session"));
    } finally {
      setRevokingSession(null);
    }
  };

  const revokeOthers = async () => {
    if (!window.confirm("Sign out all other active sessions?")) return;

    setRevokingOthers(true);
    try {
      await api.post<{ revokedCount: number }>("/api/auth/sessions/revoke-others");
      setSessions((current) => current.filter((session) => session.current));
      toast.success("Other active sessions have been signed out");
    } catch (err) {
      toast.error(errorMessage(err, "Could not sign out other sessions"));
    } finally {
      setRevokingOthers(false);
    }
  };

  const handleProfileSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim()) {
      toast.error("Name is required");
      return;
    }

    setSavingProfile(true);
    try {
      await updateProfile({ fullName: fullName.trim(), phone: phone.trim() });
      toast.success("Account profile updated");
    } catch (err) {
      toast.error(errorMessage(err, "Could not update profile"));
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed. Other active sessions have been signed out.");
    } catch (err) {
      toast.error(errorMessage(err, "Could not change password"));
    } finally {
      setSavingPassword(false);
    }
  };

  const otherSessionCount = sessions.filter((session) => !session.current).length;

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your organizer account, security, and connected workspace areas.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-primary" />
              Account profile
            </CardTitle>
            <CardDescription>These are your personal account details used across ExhibitTix.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="organizer-settings-email">Email</Label>
                <Input id="organizer-settings-email" value={user.email} disabled readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organizer-settings-name">Full name</Label>
                <Input
                  id="organizer-settings-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  maxLength={200}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organizer-settings-phone">Phone</Label>
                <Input
                  id="organizer-settings-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  maxLength={32}
                  placeholder="+91 98765 43210"
                />
              </div>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Change password
            </CardTitle>
            <CardDescription>
              Use at least 12 characters with upper and lower case, a number, and a symbol.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="organizer-current-password">Current password</Label>
                <Input
                  id="organizer-current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organizer-new-password">New password</Label>
                <Input
                  id="organizer-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={12}
                  maxLength={128}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organizer-confirm-password">Confirm new password</Label>
                <Input
                  id="organizer-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={savingPassword}>
                {savingPassword ? "Updating..." : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            Active sessions
          </CardTitle>
          <CardDescription>
            Review signed-in sessions and sign out devices you no longer use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {loadingSessions
                ? "Loading sessions..."
                : `${sessions.length} active session${sessions.length === 1 ? "" : "s"}`}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={revokeOthers}
              disabled={loadingSessions || revokingOthers || otherSessionCount === 0}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {revokingOthers ? "Signing out..." : "Sign out other sessions"}
            </Button>
          </div>

          {!loadingSessions && sessions.length === 0 && (
            <p className="rounded-md border p-4 text-sm text-muted-foreground">
              No active sessions found.
            </p>
          )}

          {!loadingSessions && sessions.length > 0 && (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {session.current ? "Current session" : "Active session"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Last used {formatSessionDate(session.lastUsedAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Expires {formatSessionDate(session.expiresAt)}
                    </p>
                  </div>
                  {!session.current && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => revokeSession(session.id)}
                      disabled={revokingSession === session.id}
                    >
                      {revokingSession === session.id ? "Signing out..." : "Sign out"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Organizer workspace
          </CardTitle>
          <CardDescription>Jump directly to the workspace areas that already have dedicated controls.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Button asChild variant="outline" className="justify-start">
            <Link to="/organizer/profile">Public profile</Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link to="/organizer/team">Team & access</Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link to="/organizer/payments">Payments & billing</Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link to="/notifications">
              <Bell className="mr-2 h-4 w-4" />
              Notifications
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
