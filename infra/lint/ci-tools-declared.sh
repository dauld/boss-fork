#!/usr/bin/env bash
# Every binary the forge workflow invokes must be one the image has.
#
# WHY THIS EXISTS. Train 52's `web` job died on `bunx: command not
# found`. The Dockerfile carries a single line — `COPY --from=bun
# /usr/local/bin/bun /usr/local/bin/bun` — so the image has `bun` and
# not the `bunx` symlink that ships beside it. On a developer's Mac
# both exist, so the step passed every local check and then exited 127
# in the container, twenty minutes into a train.
#
# required-tools.txt already existed to answer exactly this question:
# "every binary the CI gate invokes, one per line", read by
# locomotive.sh so a missing tool is a red signal in seconds. But
# nothing connected the manifest to the WORKFLOW — the manifest listed
# what the image should carry, the workflow invoked whatever it liked,
# and the two drifted silently. That is CLAUDE.md §9a's fact living
# twice, and this is the equality test it asks for.
#
# WHAT IT CHECKS. The leading executable of every `run:` line in
# .forgejo/workflows/ci.yml, after stripping leading VAR=value
# assignments, must appear in required-tools.txt or in the allowlist
# below. It deliberately does not try to parse the whole shell — a
# pipeline's later stages, subshells, and `$(...)` are out of scope.
# The first word is where this class of failure lands, because it is
# the thing act resolves before any of the script runs.
#
# The allowlist is coreutils and shell builtins present in any Debian
# base. Adding to it is a decision; adding to required-tools.txt is
# how you say "the image must carry this", and that file is stamped
# into the image by build.sh, so the pair cannot drift unnoticed.
set -uo pipefail

cd "$(dirname "$0")/../.." || exit 1

WORKFLOW=".forgejo/workflows/ci.yml"
MANIFEST="infra/forge/boss-ci/required-tools.txt"

for f in "$WORKFLOW" "$MANIFEST"; do
    [ -f "$f" ] || { echo "ci-tools-declared: $f not found" >&2; exit 1; }
done

# Present in every Debian base; not worth a manifest line each.
ALLOWED_BUILTINS="bash sh echo cd set export test true false printf mkdir rm cp mv ln cat sed awk grep sort head tail tr xargs env sleep wait for if while do done then fi"

declared=$(grep -vE '^\s*#|^\s*$' "$MANIFEST" | tr -d ' ')

# Leading executable of each `run:` step, single-line form and the
# first line of a block scalar both.
invoked=$(
    awk '
        /^[[:space:]]*run:[[:space:]]*\|/ { inblock=1; blockindent=-1; next }
        inblock {
            if ($0 ~ /^[[:space:]]*$/) next
            match($0, /^[[:space:]]*/); ind = RLENGTH
            if (blockindent < 0) blockindent = ind
            else if (ind < blockindent) { inblock = 0 }
            if (inblock) { sub(/^[[:space:]]+/, ""); print; next }
        }
        /^[[:space:]]*run:[[:space:]]*[^|>]/ {
            sub(/^[[:space:]]*run:[[:space:]]*/, ""); print
        }
    ' "$WORKFLOW" |
    sed -E 's/^#.*//' |
    # Strip leading VAR=value assignments (PUPPETEER_SKIP_DOWNLOAD=1 bun install)
    sed -E 's/^([A-Za-z_][A-Za-z0-9_]*=[^ ]*[[:space:]]+)+//' |
    # `bash foo.sh` hides foo.sh behind an allowlisted interpreter, so
    # the script itself would never be checked — and a step naming a
    # script that moved fails exactly like `bunx` did. Look through the
    # interpreter to its argument.
    awk '{ if (($1 == "bash" || $1 == "sh") && NF > 1) print $2; else print $1 }' |
    grep -vE '^$' |
    sort -u
)

problems=0
for tool in $invoked; do
    case " $ALLOWED_BUILTINS " in *" $tool "*) continue ;; esac

    # A path is a script from the CHECKOUT, not a binary from the
    # image, so the manifest has nothing to say about it. The useful
    # question is whether it is there and runnable — a workflow step
    # naming a script that moved fails the same way `bunx` did, with
    # a 127 deep inside a job.
    case "$tool" in
        */*)
            if [ ! -x "$tool" ]; then
                echo "ci-tools-declared: $WORKFLOW runs \`$tool\`, which is not an" >&2
                echo "                   executable file in this tree." >&2
                problems=$((problems + 1))
            fi
            continue
            ;;
    esac

    if ! printf '%s\n' "$declared" | grep -qxF "$tool"; then
        echo "ci-tools-declared: $WORKFLOW runs \`$tool\`, which is not in $MANIFEST" >&2
        echo "                   and not a shell builtin. Either add it to the manifest" >&2
        echo "                   (and to the Dockerfile — build.sh stamps the pair), or" >&2
        echo "                   invoke a tool the image already has." >&2
        problems=$((problems + 1))
    fi
done

# A check that scrapes nothing passes vacuously. The workflow has
# always had more than a handful of run steps; if the scrape collapses
# because the YAML was reformatted, say so instead of reporting green.
count=$(printf '%s\n' "$invoked" | grep -c . || true)
if [ "$count" -lt 4 ]; then
    echo "ci-tools-declared: only scraped $count command(s) from $WORKFLOW —" >&2
    echo "                   the parse broke, so a green result would mean nothing." >&2
    exit 1
fi

if [ "$problems" -gt 0 ]; then
    exit 1
fi
echo "ci-tools-declared: $count distinct commands, all declared"
