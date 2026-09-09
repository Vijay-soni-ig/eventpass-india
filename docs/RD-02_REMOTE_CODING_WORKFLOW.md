# RD-02 Remote Coding Workflow

## Objective
Make ExhibitTix development portable and continuous: GitHub is the source of truth, Codespaces is the remote development machine, and every meaningful change is committed to a branch so work can resume from another device.

## Operating model

```text
Any device
   ↓
GitHub
   ↓
Codespace on the active branch
   ↓
Claude Code / terminal / editor
   ↓
Tests + build + local verification
   ↓
Commit + push
   ↓
GitHub Actions CI
   ↓
Pull request → review → merge
```

## First-time remote setup

1. Open the repository in GitHub.
2. Create or open a Codespace on the active work branch.
3. Let the repository devcontainer initialize.
4. Verify Git identity and repository state:
   - `git status`
   - `git branch --show-current`
   - `git remote -v`
5. Verify the application environment:
   - `npm ci`
   - `npm --prefix server ci`
   - `npm --prefix server run prisma:generate`
6. Start the stack with `npm run dev:all` when application work requires it.

## Claude Code

Claude Code may be installed and authenticated inside the Codespace using the official Claude Code installation/authentication flow. Authentication must remain user-specific and must never be committed to the repository.

Recommended checks before starting work:

```bash
claude --version
git status
git branch --show-current
```

If Claude Code is not installed in a newly created Codespace, install it using the current official Claude Code instructions rather than committing credentials or API keys to the repository.

## Standard task loop

### 1. Start from a clean branch

```bash
git status
git pull --ff-only origin <branch>
```

Do not begin a task with unexplained local modifications.

### 2. Give Claude Code a bounded task

A good remote task includes:
- objective
- files/area allowed to change
- existing behavior that must remain
- acceptance criteria
- tests required
- security/RBAC constraints
- explicit instruction not to change unrelated areas

### 3. Validate before committing

At minimum, run the checks relevant to the change. For broad changes, run:

```bash
npm run lint
npm run build
npm --prefix server run build
npm --prefix server test
```

For database changes also run Prisma generation and migration validation.

### 4. Commit frequently

Use small, descriptive commits. Never use `git add .` blindly when secrets or unrelated generated files may exist.

```bash
git status
git diff --stat
git diff
git add <specific-files>
git commit -m "<type>: <description>"
git push -u origin <branch>
```

### 5. Resume from another device

The working state is the remote branch plus committed changes. On another device:

1. Open the same repository.
2. Reopen the existing Codespace, or create a Codespace on the same branch.
3. Pull the latest branch state.
4. Run `git status`.
5. Continue from the latest commit.

Do not depend on an uncommitted local-PC-only state for important work.

## Long-running work

For work that may take hours:
- split the objective into bounded commits
- push a stable checkpoint before stopping
- keep unfinished work on the branch, not only in the local machine
- write a short checkpoint in the PR description or task notes when the next action is non-obvious
- never leave credentials, tokens, `.env` files, database dumps, or private customer data in the repository

## Branch and PR policy

- `main` is the protected production source of truth.
- Feature/hardening work occurs on dedicated branches.
- CI must pass before merge.
- Do not force-push shared branches unless there is a deliberate recovery reason.
- Keep PRs focused and reviewable.

## Recovery rules

### Codespace unavailable
Create a new Codespace from the same branch. The repository and committed state are authoritative.

### Local changes lost
Recover from the latest pushed commit. If work was never committed/pushed, it is not guaranteed to be recoverable.

### CI fails
Do not repeatedly rerun blindly. Read the failing step, reproduce locally in the Codespace where possible, fix the root cause, commit, and push.

### Database drift
Use the repository Prisma migrations as the source of truth. Never repair a remote development database by editing production data or bypassing migration history.

## Definition of done for RD-02

RD-02 is complete when all of the following are demonstrated:

- a fresh Codespace can initialize the project reproducibly
- a developer can authenticate and use Claude Code remotely without storing credentials in Git
- a task can be implemented entirely inside the Codespace
- tests/build/lint can run remotely
- changes can be committed and pushed from the Codespace
- GitHub Actions validates the pushed branch
- the same branch can be reopened from another device and work can continue
- the workflow does not require the original local PC to remain online
