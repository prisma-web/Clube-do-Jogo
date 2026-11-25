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
    printf 'OK     %-28s %-9s %3ss  %s\n' "$name" "$got" "$elapsed" "$out"
  else
    printf 'DIFERE %-28s esperado %s, veio %s (%ss)  %s\n' "$name" "$expect" "$got" "$elapsed" "$out"
    failures=$((failures + 1))
  fi
}

base_cfg=PendingNotes.cfg
if [ "$deep" = 1 ]; then
  base_cfg=../.cache/PendingNotes-deep.cfg
  sed 's/MaxRevs = 2/MaxRevs = 3/' "$MODEL/PendingNotes.cfg" >"$MODEL/$base_cfg"
fi

run base "$base_cfg" pass auto
run finding-F1-two-screens TwoScreens.cfg violation 1
run finding-F1-remount-in-flight RemountInFlight.cfg violation 1
for variant in drop-on-conflict no-load-wait unserialized-writes use-local-drops; do
  sed "s/Variant = \"none\"/Variant = \"$variant\"/" "$MODEL/PendingNotes.cfg" >"$CACHE/mutant-$variant.cfg"
  run "mutant-$variant" "../.cache/mutant-$variant.cfg" violation 1
done
sed 's/Variant = "none"/Variant = "no-rerun"/' "$MODEL/PendingNotes.cfg" >"$CACHE/mutant-no-rerun.cfg"
run mutant-no-rerun ../.cache/mutant-no-rerun.cfg violation-retry 1

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
