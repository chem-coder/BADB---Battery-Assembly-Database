# Merging Branches Workflow

## 1. Make sure local `main` matches GitHub `main`

```bash
git checkout main
git pull origin main
```

Meaning:

- `git checkout main` switches the working directory to the local `main` branch
- `git pull origin main` fetches remote commits and merges them into local `main` if differences exist

In other words:

```bash
git checkout main
git pull origin main
```

- go to where the work is happening
- make local `main` match GitHub `main`, unless there are local commits, in which case Git merges them together

## 2. Bring Dima's branch into local and merge into `main`

```bash
git fetch origin
git merge origin/dima-auth-work
```

Meaning:

- `git fetch origin` downloads all branches and updates from GitHub
- it does not change local files or branches
- `git merge origin/dima-auth-work` takes the commits from Dima's branch
- applies them onto the current branch (`main`)
- combines both histories into one branch

## 3. If step 2 does not work

```bash
git branch
git branch -r
git branch -a
```

- `git branch` lists local branches
- `git branch -r` lists remote branches
- `git branch -a` lists all branches

## Message to Dima

Dima, I have merged our branches into `main`.
Please update your local repo:

```bash
git checkout main
git pull origin main
```

## Message in Russian

Дима, я смержила твою ветку `dima/integrate-auth-frontend` в `main`.
Сейчас `main` — это объединённая версия (моя + твоя).

Когда вернёшься к проекту, просто подтяни актуальный `main`:

```bash
git checkout main
git pull origin main
```

Дальше можно работать от `main` (лучше через новую ветку).

Then create a new branch for work:

```bash
git checkout -b feature/...
```

Workflow after that:

```bash
work -> commit -> push
```

Old branches are left in place as history.
