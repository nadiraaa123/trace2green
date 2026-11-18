#!/usr/bin/env bash
# One-time production setup using the existing scripts. Run on YOUR machine:
#   bash scripts/setup-production.sh /path/to/service-account.json <firebase-project-id> <admin-email-A> <admin-email-B>
# - Never prints or stores the key; it lives only in this shell's environment.
# - Asks before every write. Seed is idempotent and never overwrites trial data.
# - Generates strong passwords locally and shows them once in your terminal.
set -euo pipefail
KEY_FILE="${1:?service-account.json path}"; PROJECT="${2:?firebase project id}"; EMAIL_A="${3:?admin email for CMP-A}"; EMAIL_B="${4:?admin email for CMP-B}"
[ -f "$KEY_FILE" ] || { echo "Key file not found"; exit 1; }
node -e 'process.exit(+process.versions.node.split(".")[0] >= 24 ? 0 : 1)' || { echo "Node 24 required (see .nvmrc)"; exit 1; }
unset FIRESTORE_EMULATOR_HOST FIREBASE_AUTH_EMULATOR_HOST NEXT_PUBLIC_USE_FIREBASE_EMULATOR

KEY_PROJECT=$(node -e 'console.log(require(require("path").resolve(process.argv[1])).project_id)' "$KEY_FILE")
echo "Service account project: $KEY_PROJECT   expected: $PROJECT"
[ "$KEY_PROJECT" = "$PROJECT" ] || { echo "Project mismatch: the key belongs to another project. Stopping."; exit 1; }
export GOOGLE_APPLICATION_CREDENTIALS="$(cd "$(dirname "$KEY_FILE")" && pwd)/$(basename "$KEY_FILE")"
export FIREBASE_SERVICE_ACCOUNT_KEY="$(base64 < "$KEY_FILE" | tr -d '\n')"
export FIREBASE_PROJECT_ID="$PROJECT"
ask() { read -r -p "$1 [y/N] " a; [ "$a" = "y" ] || [ "$a" = "Y" ]; }

echo; echo "== 1/4 Deploy Firestore rules and indexes (replaces the project's current rules) =="
ask "Deploy firestore.rules and firestore.indexes.json to $PROJECT?" && npx firebase deploy --only firestore:rules,firestore:indexes --project "$PROJECT" --non-interactive

echo; echo "== 2/4 Import simulated workbook (dry run first) =="
npx tsx scripts/seed.ts --dry-run
ask "Write the import to $PROJECT? (idempotent; existing trial data is kept)" && npx tsx scripts/seed.ts --confirm-production

echo; echo "== 3/4 Create company demo accounts =="
if ask "Create/update admin accounts $EMAIL_A (CMP-A) and $EMAIL_B (CMP-B)?"; then
  PASS_A="$(node -e 'console.log(require("crypto").randomBytes(12).toString("base64url"))')"
  PASS_B="$(node -e 'console.log(require("crypto").randomBytes(12).toString("base64url"))')"
  npx tsx scripts/provision.ts company CMP-A "Perusahaan Mitra A" "$EMAIL_A" "$PASS_A" demo
  npx tsx scripts/provision.ts company CMP-B "Perusahaan Mitra B" "$EMAIL_B" "$PASS_B" demo
  echo "Passwords (shown once, only used if the account was newly created — store them in a password manager):"
  echo "  $EMAIL_A  $PASS_A"; echo "  $EMAIL_B  $PASS_B"
fi

echo; echo "== 4/4 Verify (read-only) =="
npx tsx scripts/verify-production.ts CMP-A CMP-B
