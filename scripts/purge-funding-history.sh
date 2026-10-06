#!/usr/bin/env bash
# Purge funding/ and the CLAUDE.md "Funding tracker" section from EVERY commit of the public repo.
#
# DO NOT run the real thing before 2026-10-12 09:00 Vilnius (06:00 UTC): a submitted entry links to
# github.com/zbagdzevicius/tokentails/tree/main/funding/... and must keep working until then.
#
# What it does, all inside a scratch directory (your working checkout is never touched):
#   1. Mirror-clones the public repo (fresh, from GitHub by default).
#   2. Syncs the private repo zbagdzevicius/tokentails-funding: re-filters funding/'s full history
#      (git filter-repo --subdirectory-filter funding), merges it into the private main, and copies
#      the latest CLAUDE.md tracker section into FUNDING-TRACKER.md. Pushes the private repo only in
#      --execute mode, only after checking it is PRIVATE, and never with --force.
#   3. Rewrites the mirror: drops funding/ (and $EXTRA_PATHS) from every commit and replaces the
#      CLAUDE.md "Funding tracker" section with a pointer to the private file.
#   4. Proves it: no path under funding/ in any reachable tree, no tracker text in any reachable blob,
#      old funding/ blobs gone from the object store. Prints before/after commit counts.
#   5. Prints the exact force-push and cleanup commands. It never force-pushes the public repo itself.
#
# Usage:
#   scripts/purge-funding-history.sh --dry-run            # any time: everything except pushes
#   scripts/purge-funding-history.sh --execute            # after 2026-10-12 06:00 UTC: also pushes the
#                                                         # PRIVATE repo, then prints the public commands
# Options (env):
#   SOURCE=<url or path>   what to mirror (default: $PUBLIC_URL). A local path is for testing only.
#   WORK=<dir>             scratch directory (default: a new mktemp dir; must not exist or be empty)
#   EXTRA_PATHS="a b/ c"   more paths to purge (git filter-repo --path semantics), e.g. after you decide
#                          on docs/plans/* (see the report that came with this script).
#   PRIVATE_BASE=<sha>     the filtered funding/ tip the private repo was created from (default below);
#                          the merge refuses histories that do not share it.
# Needs: git, git-filter-repo (with --file-info-callback and --sensitive-data-removal), gh, python3.

set -euo pipefail

PUBLIC_URL=${PUBLIC_URL:-https://github.com/zbagdzevicius/tokentails.git}
PRIVATE_URL=${PRIVATE_URL:-https://github.com/zbagdzevicius/tokentails-funding.git}
PRIVATE_SLUG=${PRIVATE_SLUG:-zbagdzevicius/tokentails-funding}
SOURCE=${SOURCE:-$PUBLIC_URL}
EXTRA_PATHS=${EXTRA_PATHS:-}
# Tip of `git filter-repo --subdirectory-filter funding` on public commit 1eb078c3 (2026-10-06): the
# private repo's history starts from it. filter-repo is deterministic, so a re-filter extends it.
PRIVATE_BASE=${PRIVATE_BASE:-bba9d9cbb4eabd5615860162b6a291bfae2ddd58}
NOT_BEFORE_UTC="2026-10-12T06:00:00Z"
TRACKER_HEADING='## Funding tracker (keep this current)'
# Text that must not survive anywhere in the public history.
FORBIDDEN=('## Funding tracker (keep this current)' '### Critical path' '### Decision points')

MODE=""
case "${1:-}" in
  --dry-run) MODE=dry ;;
  --execute) MODE=exec ;;
  *) echo "usage: $0 --dry-run | --execute" >&2; exit 2 ;;
esac

die() { echo "ABORT: $*" >&2; exit 1; }
say() { printf '\n== %s\n' "$*"; }

command -v git-filter-repo >/dev/null || die "git-filter-repo is not installed (brew install git-filter-repo)"
git-filter-repo --help 2>&1 | grep -q -- '--file-info-callback' || die "git-filter-repo is too old (needs --file-info-callback)"
git-filter-repo --help 2>&1 | grep -q -- '--sensitive-data-removal' || die "git-filter-repo is too old (needs --sensitive-data-removal)"

if [ "$MODE" = exec ]; then
  now=$(date -u +%s)
  gate=$(python3 -c "import datetime as d; print(int(d.datetime.fromisoformat('${NOT_BEFORE_UTC%Z}+00:00').timestamp()))")
  [ "$now" -ge "$gate" ] || die "too early: not before $NOT_BEFORE_UTC (2026-10-12 09:00 Vilnius). Use --dry-run."
fi

WORK=${WORK:-$(mktemp -d "${TMPDIR:-/tmp}/purge-funding.XXXXXX")}
mkdir -p "$WORK"
[ -z "$(ls -A "$WORK")" ] || die "WORK=$WORK is not empty"
MIRROR="$WORK/public.git"
echo "mode: $MODE   source: $SOURCE   work: $WORK"

# ---------------------------------------------------------------------------------------------
say "1. Mirror clone"
git clone --quiet --mirror "$SOURCE" "$MIRROR"
G() { git -C "$MIRROR" "$@"; }
G show-ref --verify --quiet refs/heads/main || die "the mirror has no main branch"

G for-each-ref --format='%(refname) %(objectname)' > "$WORK/refs-before.txt"
BEFORE_ALL=$(G rev-list --all --count)
echo "refs: $(wc -l < "$WORK/refs-before.txt" | tr -d ' ')   commits (all refs): $BEFORE_ALL"
while read -r ref sha; do
  echo "  $ref ${sha:0:10} commits=$(G rev-list --count "$sha")"
done < "$WORK/refs-before.txt"
BEFORE_FUNDING_COMMITS=$(G log --all --format=%H -- funding | wc -l | tr -d ' ')
BEFORE_FUNDING_PATHS=$(G log --all --format= --name-only -- funding | sort -u | grep -c . || true)
echo "commits touching funding/: $BEFORE_FUNDING_COMMITS   distinct funding/ paths ever: $BEFORE_FUNDING_PATHS"
# A few funding/ blob ids to prove later that the objects themselves are gone.
G ls-tree -r main -- funding | awk '{print $3}' | head -n 20 > "$WORK/funding-blobs-sample.txt" || true

# ---------------------------------------------------------------------------------------------
say "2. Sync the private repo ($PRIVATE_SLUG)"
FILTERED="$WORK/funding-filtered"
git clone --quiet --no-local --single-branch --branch main "$MIRROR" "$FILTERED"
git -C "$FILTERED" filter-repo --quiet --force --subdirectory-filter funding
FILTERED_TIP=$(git -C "$FILTERED" rev-parse HEAD)
echo "filtered funding/ history: $(git -C "$FILTERED" rev-list --count HEAD) commits, tip ${FILTERED_TIP:0:10}"
git -C "$FILTERED" merge-base --is-ancestor "$PRIVATE_BASE" HEAD \
  || die "the re-filtered history does not contain PRIVATE_BASE ${PRIVATE_BASE:0:10}: the public history changed under funding/; merge by hand"

VIS=$(gh repo view "$PRIVATE_SLUG" --json visibility --jq .visibility)
[ "$VIS" = PRIVATE ] || die "$PRIVATE_SLUG is $VIS, not PRIVATE"
PRIV="$WORK/private"
git clone --quiet "$PRIVATE_URL" "$PRIV"
git -C "$PRIV" fetch --quiet "$FILTERED" HEAD:refs/remotes/filtered/main
git -C "$PRIV" merge-base --is-ancestor "$PRIVATE_BASE" HEAD || die "private main does not descend from PRIVATE_BASE"
if git -C "$PRIV" merge-base --is-ancestor filtered/main HEAD; then
  echo "private repo already has every funding/ commit"
else
  git -C "$PRIV" merge --no-edit -m "merge: latest funding/ history from the public repo (pre-purge)" filtered/main \
    || die "merge conflict in $PRIV; resolve there, push, then rerun"
fi
# Latest tracker section from the public main's CLAUDE.md, under the private file's own header.
G show main:CLAUDE.md > "$WORK/CLAUDE.main.md"
python3 - "$WORK/CLAUDE.main.md" "$PRIV/FUNDING-TRACKER.md" <<'PY'
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
i = s.find('\n## Funding tracker')
if i == -1:
    sys.exit('no "## Funding tracker" section in main:CLAUDE.md (already moved?)')
j = s.find('\n## ', i + 1)
sec = s[i + 1:] if j == -1 else s[i + 1:j + 1]
sec = sec.replace('## Funding tracker (keep this current)', '# Funding tracker (keep this current)', 1).replace('\n### ', '\n## ')
old = open(dst, encoding='utf-8').read()
k = old.find('-->')
header = old[:k + 3] + '\n\n' if old.startswith('<!--') and k != -1 else ''
open(dst, 'w', encoding='utf-8').write(header + sec.rstrip('\n') + '\n')
PY
if [ -n "$(git -C "$PRIV" status --porcelain FUNDING-TRACKER.md)" ]; then
  git -C "$PRIV" add FUNDING-TRACKER.md
  git -C "$PRIV" commit --quiet -m "docs(tracker): latest copy from the public CLAUDE.md before the purge"
fi
BAD=$(git -C "$PRIV" ls-files | awk 'tolower($0) ~ /(^|\/)\.secrets\/|\.pem$|\.key$|\.p12$|\.jks$|keystore|(^|\/)\.env|password|(^|\/)broadcast\//' || true)
[ -z "$BAD" ] || die "the private repo would contain secret-looking files: $BAD"
echo "private main: $(git -C "$PRIV" rev-list --count HEAD) commits, tip $(git -C "$PRIV" rev-parse --short HEAD)"
if [ "$MODE" = exec ]; then
  git -C "$PRIV" push origin HEAD:main   # fast-forward only; refuses if someone pushed meanwhile
else
  echo "(dry run: private repo NOT pushed)"
fi

# ---------------------------------------------------------------------------------------------
say "3. Rewrite the public mirror"
CALLBACK="$WORK/claude-md-callback.py"
cat > "$CALLBACK" <<'PY'
if filename == b'CLAUDE.md':
    data = value.get_contents_by_identifier(blob_id)
    i = data.find(b'\n## Funding tracker')
    if i != -1:
        j = data.find(b'\n## ', i + 1)
        tail = data[j:] if j != -1 else b''
        pointer = (b'\n## Funding tracker\n\n'
                   b'Private. It lives in the private funding repo, checked out at `funding/` (see\n'
                   b'`docs/DEVELOPMENT.md`, "The private funding checkout"). Keep it current there, never here:\n'
                   b'@funding/FUNDING-TRACKER.md\n')
        blob_id = value.insert_file_with_contents(data[:i] + pointer + tail)
return (filename, mode, blob_id)
PY
PATH_ARGS=(--path funding/)
for p in $EXTRA_PATHS; do PATH_ARGS+=(--path "$p"); done
echo "purging: ${PATH_ARGS[*]}  + CLAUDE.md tracker section"
G filter-repo --force --sensitive-data-removal --no-fetch --invert-paths "${PATH_ARGS[@]}" \
  --file-info-callback "$CALLBACK" 2>&1 | tee "$WORK/filter-repo.log" | tail -n 25
# --no-fetch: the mirror clone above already has every ref GitHub serves.

# ---------------------------------------------------------------------------------------------
say "4. Proof"
G for-each-ref --format='%(refname) %(objectname)' > "$WORK/refs-after.txt"
AFTER_ALL=$(G rev-list --all --count)
fail=0
n=$(G log --all --format= --name-only | grep -c '^funding/' || true)
echo "paths under funding/ in any commit: $n"; [ "$n" = 0 ] || fail=1
n=$(G rev-list --all --objects | awk '$2 ~ /^funding(\/|$)/' | wc -l | tr -d ' ')
echo "reachable objects named funding/...: $n"; [ "$n" = 0 ] || fail=1
for p in $EXTRA_PATHS; do
  n=$(G log --all --format= --name-only | grep -c "^${p%/}" || true)
  echo "paths under $p: $n"; [ "$n" = 0 ] || fail=1
done
G rev-list --all --objects | awk 'NF==2 {print $1}' | sort -u > "$WORK/reachable-objects.txt"
G cat-file --batch-check='%(objectname) %(objecttype)' < "$WORK/reachable-objects.txt" | awk '$2=="blob"{print $1}' > "$WORK/blobs.txt"
echo "reachable blobs scanned: $(wc -l < "$WORK/blobs.txt" | tr -d ' ')"
GREP_ARGS=(); for s in "${FORBIDDEN[@]}"; do GREP_ARGS+=(-e "$s"); done
G cat-file --batch < "$WORK/blobs.txt" | LC_ALL=C grep -a -o -F "${GREP_ARGS[@]}" | sort | uniq -c > "$WORK/forbidden-hits.txt" || true
for s in "${FORBIDDEN[@]}"; do
  hits=$(awk -v s="$s" '{n=$1; $1=""; sub(/^ /,""); if ($0==s) print n}' "$WORK/forbidden-hits.txt")
  echo "occurrences of '$s' in reachable blobs: ${hits:-0}"; [ -z "$hits" ] || fail=1
done
gone=0; total=0
while read -r b; do total=$((total+1)); G cat-file -e "$b" 2>/dev/null || gone=$((gone+1)); done < "$WORK/funding-blobs-sample.txt"
echo "sampled old funding/ blobs gone from the object store: $gone/$total"
[ "$gone" = "$total" ] || echo "  (some sampled blobs still exist: identical content may also live outside funding/; check by hand)"
echo
echo "commits (all refs): before $BEFORE_ALL, after $AFTER_ALL"
echo "rewritten refs:"
join <(sort "$WORK/refs-before.txt") <(sort "$WORK/refs-after.txt") | while read -r ref old new; do
  [ "$old" = "$new" ] && continue
  echo "  $ref ${old:0:10} -> ${new:0:10} commits=$(G rev-list --count "$new")"
done
G show main:CLAUDE.md | grep -n -A5 '^## Funding tracker' || true
[ "$fail" = 0 ] || die "proof failed; do not push"
echo "PROOF OK"

# ---------------------------------------------------------------------------------------------
say "5. Next steps (run by hand; nothing below has been run)"
cat <<EOF

# 5a. Force-push the rewritten branches. --force-with-lease refuses if anyone pushed after the mirror
#     clone; then rerun this script from the start.
EOF
join <(sort "$WORK/refs-before.txt") <(sort "$WORK/refs-after.txt") | while read -r ref old new; do
  [ "$old" = "$new" ] && continue
  case "$ref" in
    refs/heads/*) echo "git -C '$MIRROR' push --force-with-lease='$ref:$old' '$PUBLIC_URL' '$new:$ref'" ;;
    refs/pull/*)  echo "# $ref changed but GitHub refuses pushes to PR refs: ask GitHub Support to drop it (5e)" ;;
    *)            echo "# $ref changed: push it too if it exists on GitHub: git -C '$MIRROR' push --force-with-lease='$ref:$old' '$PUBLIC_URL' '$new:$ref'" ;;
  esac
done
cat <<'EOF'

# 5b. Keep it from coming back: gitignore funding/ (a normal push, no force).
git clone https://github.com/zbagdzevicius/tokentails.git /tmp/tt-after && cd /tmp/tt-after
git checkout feat/funding-winning-strategy
printf '\n# The private funding repo is checked out here (docs/DEVELOPMENT.md); never commit it.\nfunding/\n' >> .gitignore
git add .gitignore && git commit -m "chore: ignore funding/ (private repo checkout)"
git push origin HEAD && git push origin HEAD:main

# 5c. Your machine. Old clones still hold the purged history: never push from them.
mv ~/me/tokentails-app ~/me/tokentails-app.pre-purge           # keep it until 5d is checked
git clone https://github.com/zbagdzevicius/tokentails.git ~/me/tokentails-app
cd ~/me/tokentails-app && git checkout feat/funding-winning-strategy
git clone https://github.com/zbagdzevicius/tokentails-funding.git funding
cp -R ~/me/tokentails-app.pre-purge/funding/.secrets funding/          # keystore passwords (gitignored)
#   also copy any other untracked local state you rely on (e.g. contracts' out/ or broadcast/, the
#   .env files of each package, funding/RULES-COMPLIANCE.md), then npm ci in each package.
#   Uncommitted work in the old checkout: bring it over as files (diff/patch), never by merging history.

# 5d. Check
git log --all --format= --name-only | grep -c '^funding/'      # 0
git check-ignore -v funding/README.md                           # .gitignore:...:funding/
node funding/framework/bin/fund.mjs facts build --check

# 5e. GitHub, Vercel and other copies
# - Vercel redeploys from the new main automatically; check tokentails.com and /shelter-payouts.
# - GitHub keeps unreachable commits viewable by SHA and in caches: open a sensitive-data removal
#   request with GitHub Support for zbagdzevicius/tokentails, listing the purged path funding/ and
#   the first changed commits from the filter-repo output above (filter-repo.log in the work dir).
# - Every other clone (other machines, agent worktrees, CI caches) must re-clone; a push from an old
#   clone would bring funding/ back. There are no forks today (gh api repos/zbagdzevicius/tokentails
#   --jq .forks_count was 0 on 2026-10-06; check again).
# - Delete the stale local branch `main` in any old clone instead of rebasing it.
# - Links into github.com/zbagdzevicius/tokentails/tree/main/funding/... now 404: point submissions
#   and drafts at /tree/main/contracts/shelter-split instead.
EOF
echo
echo "work dir: $WORK (delete it when done: it holds the purged mirror and the filter-repo log)"
