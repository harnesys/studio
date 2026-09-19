# git-branch

Переключение и создание веток workspace-git. Поповер как в JetBrains, но MVP только Checkout + New Branch.

**API:** `openNewBranchDialog(from?)`, `NewBranchDialog`.

**Server:** `GetGitStatus`, `CheckoutGitBranch`, `CreateGitBranch` + `GitCliAdapter`.
