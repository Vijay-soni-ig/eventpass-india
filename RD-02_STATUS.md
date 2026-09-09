# RD-02 Remote Coding Workflow — Status

## Current status
FOUNDATION IMPLEMENTED — awaiting live remote workflow verification.

## Implemented
- RD-01 runbook is branch-agnostic.
- RD-02 remote coding workflow documented.
- GitHub remains the source of truth.
- Codespaces remains the remote development machine.
- Claude Code is explicitly treated as a remote coding tool with user-owned authentication and no repository-stored credentials.
- Commit/push/CI/resume-from-another-device workflow is defined.

## Required live verification
1. Open a Codespace from `rd-02-remote-coding`.
2. Confirm devcontainer initialization succeeds.
3. Confirm `claude --version` after installing/authenticating Claude Code using the official flow if not already available.
4. Make a harmless documentation-only change in the Codespace.
5. Commit and push the change from the Codespace.
6. Confirm GitHub Actions runs and passes on the pushed branch.
7. Reopen the same Codespace or create another Codespace from the branch and confirm the pushed commit is available.
8. Confirm the original local PC is not required for continuation.

## Security gate
- No Anthropic API key, Claude credential, GitHub token, production secret, `.env`, or customer data may be committed.
- Do not grant Claude Code broader repository permissions than required for the task.

## Verdict rule
RD-02 becomes PASS only after the live workflow above is evidenced. Documentation alone is not sufficient proof.

