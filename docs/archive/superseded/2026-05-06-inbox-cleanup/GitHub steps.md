
- keep working on `feature/printout-battery`
- you finish and commit your current changes
- Dima continues on a new branch
- later, when you are ready, you merge his old branch into `main`

That avoids mixing his old work into your uncommitted printout work, which is cleaner.

When you are ready later, the merge steps will be:

```bash
git fetch origin
git checkout main
git pull origin main
git merge origin/dima/v2-security-mobile-dashboard
git push origin main
```

So for now, you do not need to do anything about his branch.