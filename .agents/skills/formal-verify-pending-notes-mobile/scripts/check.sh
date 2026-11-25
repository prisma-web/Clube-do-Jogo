#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(git -C "$SKILL_DIR" rev-parse --show-toplevel)"
MODEL="$SKILL_DIR/model"
CACHE="$SKILL_DIR/.cache"
TLA_VERSION=1.7.4
TLA_SHA256=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88
JAR="$CACHE/tla2tools-$TLA_VERSION.jar"

deep=0
reviewed=0
for arg in "$@"; do
  case "$arg" in
    --deep) deep=1 ;;
    --reviewed) reviewed=1 ;;
    *) echo "uso: $0 [--deep] [--reviewed]" >&2; exit 64 ;;
  esac
done

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

command -v java >/dev/null 2>&1 || { echo "java não encontrado: instale um JDK 11 ou mais novo." >&2; exit 1; }
if [ "$deep" = 1 ] && ! command -v python3 >/dev/null 2>&1; then echo "python3 não encontrado: o --deep precisa dele para view-sound." >&2; exit 1; fi
mkdir -p "$CACHE"
if [ ! -f "$JAR" ] || [ "$(sha256 "$JAR")" != "$TLA_SHA256" ]; then
  echo "baixando tla2tools.jar v$TLA_VERSION para $CACHE"
  curl -fsSL -o "$JAR.part" "https://github.com/tlaplus/tlaplus/releases/download/v$TLA_VERSION/tla2tools.jar"
  got="$(sha256 "$JAR.part")"
  if [ "$got" != "$TLA_SHA256" ]; then
    echo "checksum inesperado para tla2tools.jar: $got" >&2
    exit 1
  fi
  mv "$JAR.part" "$JAR"
fi

failures=0

run() {
  local name="$1" cfg="$2" expect="$3" workers="$4" out="$CACHE/$1.out" start elapsed got
  start=$(date +%s)
  (cd "$MODEL" && java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -deadlock -cleanup -workers "$workers" \
    -metadir "$CACHE/states/$name" -config "$cfg" PendingNotes.tla) >"$out" 2>&1 || true
  elapsed=$(( $(date +%s) - start ))
  if grep -q "Model checking completed. No error has been found." "$out"; then got=pass
  elif grep -q "Invariant NoLostNote is violated." "$out"; then got=violation
  elif grep -q "Invariant NoLostRetry is violated." "$out"; then got=violation-retry
  else got=error; fi
  if [ "$got" = "$expect" ]; then
    printf 'OK     %-36s %-9s %3ss  %s\n' "$name" "$got" "$elapsed" "$out"
  else
    printf 'DIFERE %-36s esperado %s, veio %s (%ss)  %s\n' "$name" "$expect" "$got" "$elapsed" "$out"
    failures=$((failures + 1))
  fi
}

check() {
  local name="$1" src="$2" variant="$3" expect="$4" workers="$5"
  sed "s/Variant = \"none\"/Variant = \"$variant\"/" "$MODEL/$src" >"$CACHE/$name.cfg"
  if [ "$deep" = 1 ]; then
    sed 's/MaxRevs = 2/MaxRevs = 3/' "$CACHE/$name.cfg" >"$CACHE/$name.cfg.part"
    echo "VIEW ReducedView" >>"$CACHE/$name.cfg.part"
    mv "$CACHE/$name.cfg.part" "$CACHE/$name.cfg"
  fi
  run "$name" "../.cache/$name.cfg" "$expect" "$workers"
}

orbits() {
  (cd "$MODEL" && java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -deadlock -cleanup -workers auto \
    -metadir "$CACHE/states/view-sound-$1" -config "$CACHE/view-sound-$1.cfg" ViewSound.tla) 2>&1 \
    | python3 "$SKILL_DIR/scripts/orbits.py" "$CACHE/view-sound-$1.orbits" 2>"$CACHE/view-sound-$1.out" || true
}

view_sound() {
  local start elapsed a b
  start=$(date +%s)
  sed 's/^INVARIANTS.*/INVARIANT PrintOrbit/' "$MODEL/PendingNotes.cfg" >"$CACHE/view-sound-full.cfg"
  { cat "$CACHE/view-sound-full.cfg"; echo "VIEW ReducedView"; } >"$CACHE/view-sound-view.cfg"
  a="$(orbits full)"
  b="$(orbits view)"
  elapsed=$(( $(date +%s) - start ))
  if [ -n "$a" ] && [ "$a" -gt 0 ] && cmp -s "$CACHE/view-sound-full.orbits" "$CACHE/view-sound-view.orbits"; then
    printf 'OK     %-36s %-9s %3ss  %s órbitas com e sem VIEW\n' view-sound igual "$elapsed" "$a"
  else
    printf 'DIFERE %-36s esperado igual, veio %s sem VIEW e %s com VIEW (%ss)  %s\n' view-sound "${a:-0}" "${b:-0}" "$elapsed" "$CACHE/view-sound-*.out"
    failures=$((failures + 1))
  fi
}

check base PendingNotes.cfg none pass auto
check regression-F1-two-screens TwoScreens.cfg none pass auto
check regression-F1-remount-in-flight RemountInFlight.cfg none pass auto
for variant in drop-on-conflict reload-on-mount unserialized-writes use-local-drops; do
  check "mutant-$variant" PendingNotes.cfg "$variant" violation 1
done
for scenario in TwoScreens RemountInFlight; do
  check "mutant-per-instance-$scenario" "$scenario.cfg" per-instance violation 1
done
check mutant-no-rerun PendingNotes.cfg no-rerun violation-retry 1
if [ "$deep" = 1 ]; then view_sound; fi

sync="$(awk '/^```coverage/{on=1; next} on && /^```/{exit} on && $1=="sync"{print $2}' "$SKILL_DIR/SKILL.md")"
files=()
while IFS= read -r path; do files+=("$path"); done < <(awk '/^```coverage/{on=1; next} on && /^```/{exit} on && $1!="sync"{print $1}' "$SKILL_DIR/SKILL.md")
git -C "$REPO" cat-file -e "$sync^{commit}" 2>/dev/null \
  || { echo "o sync commit $sync não está neste clone (git fetch?)." >&2; exit 1; }
changed="$(GIT_LITERAL_PATHSPECS=1 git -C "$REPO" diff --stat "$sync" -- "${files[@]}")"
for path in "${files[@]}"; do
  [ -e "$REPO/$path" ] || changed="$changed"$'\n'"$path (não existe mais)"
done
if [ -n "$changed" ]; then
  echo "código coberto mudou desde o sync $sync:"
  echo "$changed"
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures checagem(ns) diferem do registro em SKILL.md. Leia cada .out com /statechart antes de concluir qualquer coisa."
  exit 1
fi
if [ -n "$changed" ] && [ "$reviewed" = 0 ]; then
  echo "leia 'git diff $sync -- <arquivos acima>', ajuste o modelo se o diff tocar o que ele descreve, e rode de novo com --reviewed."
  exit 2
fi
echo "tudo como registrado em SKILL.md."
