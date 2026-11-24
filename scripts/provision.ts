/**
 * Controlled provisioning of company admins and the platform admin.
 * Company accounts are never self-registered.
 *
 *   npx tsx scripts/provision.ts company <companyId> "<Company name>" <email> <password> [demo|trial|production] [--no-verify]
 *   (company admins can verify reports by default; --no-verify creates a view-only admin)
 *   npx tsx scripts/provision.ts platform-admin <email> <password>
 *   npx tsx scripts/provision.ts customer-success <CS-001> "<Name>" <email> <password>
 *   npx tsx scripts/provision.ts show <email>                      # read-only: role/scope
 *   NEW_PASSWORD=... npx tsx scripts/provision.ts set-password <email>
 *   Existing accounts keep their password and role; changing a role needs --reassign.
 *   (internal Trace2Green staff; sees only suppliers assigned to it by the Platform Admin)
 *
 * Passwords are passed on the command line for local/demo setup only; for a real
 * deployment create the user in the Firebase console and run with an existing email.
 */
import { FieldValue } from "firebase-admin/firestore";
import { auth, db, target } from "./_admin";

async function upsertUser(email: string, password: string, displayName: string) {
  try {
    const u = await auth.getUserByEmail(email);
    console.log(`NOTE: ${email} already exists — its password was NOT changed (use set-password).`);
    return u;
  } catch {
    return auth.createUser({ email, password, displayName, emailVerified: true });
  }
}

/** Refuse to silently change an existing account's role; --reassign makes it explicit. */
function guardRole(email: string, current: unknown, wanted: string, reassign: boolean) {
  if (current && current !== wanted && !reassign) {
    throw new Error(`${email} already has role ${String(current)}; refusing to change it (add --reassign to do it on purpose).`);
  }
}

async function main() {
  const [kind, ...args] = process.argv.slice(2);
  console.log(`Target: ${target}`);
  const now = FieldValue.serverTimestamp();

  if (kind === "company") {
    const canVerify = !args.includes("--no-verify");
    const reassign = args.includes("--reassign");
    const [companyId, name, email, password, ds = "demo"] = args.filter((a) => a !== "--no-verify" && a !== "--reassign");
    if (!/^CMP-[A-Z0-9]+$/.test(companyId ?? "") || !name || !email || !password) {
      throw new Error("Usage: company <CMP-X> <name> <email> <password> [dataSource]");
    }
    const user = await upsertUser(email, password, `Admin ${name}`);
    guardRole(email, user.customClaims?.role, "company_admin", reassign);
    await db.doc(`companies/${companyId}`).set(
      { companyId, name, plan: "trial", dataSource: ds, isSimulated: ds === "demo", createdAt: now, updatedAt: now },
      { merge: true },
    );
    await db.doc(`users/${user.uid}`).set({
      uid: user.uid, email, displayName: `Admin ${name}`, role: "company_admin",
      companyId, supplierId: null, canVerify, dataSource: ds, isSimulated: false, createdAt: now, updatedAt: now,
    }, { merge: true });
    await auth.setCustomUserClaims(user.uid, { role: "company_admin", companyId, canVerify });
    console.log(`Company admin ${email} -> ${companyId}${canVerify ? " (reviewer)" : " (view only)"}`);
  } else if (kind === "platform-admin") {
    const reassign = args.includes("--reassign");
    const [email, password] = args.filter((a) => a !== "--reassign");
    if (!email || !password) throw new Error("Usage: platform-admin <email> <password> [--reassign]");
    const user = await upsertUser(email, password, "Platform Admin");
    guardRole(email, user.customClaims?.role, "platform_admin", reassign);
    await db.doc(`users/${user.uid}`).set({
      uid: user.uid, email, displayName: "Platform Admin", role: "platform_admin",
      companyId: null, supplierId: null, dataSource: "demo", isSimulated: false, createdAt: now, updatedAt: now,
    }, { merge: true });
    await auth.setCustomUserClaims(user.uid, { role: "platform_admin" });
    console.log(`Platform admin ${email}`);
  } else if (kind === "customer-success") {
    const [csId, name, email, password] = args;
    if (!/^CS-\d{3}$/.test(csId ?? "") || !name || !email || !password) throw new Error("Usage: customer-success <CS-001> <name> <email> <password>");
    const user = await upsertUser(email, password, name);
    const existing = user.customClaims;
    if (existing?.role && (existing.role !== "customer_success" || existing.csId !== csId)) {
      throw new Error(`${email} already has role ${existing.role}${existing.csId ? ` (${existing.csId})` : ""}; refusing to change it.`);
    }
    const staff = await db.doc(`cs_staff/${csId}`).get();
    if (staff.exists && staff.data()!.email !== email) throw new Error(`${csId} already belongs to ${staff.data()!.email}.`);
    await db.doc(`cs_staff/${csId}`).set({ csId, name, email, uid: user.uid, capacity: 70, active: true, scenario: false, updatedAt: now, ...(staff.exists ? {} : { createdAt: now }) }, { merge: true });
    await db.doc(`users/${user.uid}`).set({
      uid: user.uid, email, displayName: name, role: "customer_success", csId,
      companyId: null, supplierId: null, dataSource: "production", isSimulated: false, createdAt: now, updatedAt: now,
    }, { merge: true });
    await auth.setCustomUserClaims(user.uid, { role: "customer_success", csId });
    console.log(`Customer Success ${email} -> ${csId}`);
  } else if (kind === "show") {
    // Read-only: role and scope of an account (never prints secrets).
    const [email] = args;
    const u = await auth.getUserByEmail(email);
    const c = u.customClaims ?? {};
    console.log(`${email}: role=${c.role ?? "-"} companyId=${c.companyId ?? "-"} csId=${c.csId ?? "-"} supplierId=${c.supplierId ?? "-"} disabled=${u.disabled}`);
  } else if (kind === "set-password") {
    // New password comes from the NEW_PASSWORD env var so it never lands in shell history.
    const [email] = args;
    const pw = process.env.NEW_PASSWORD ?? "";
    if (!email || pw.length < 10) throw new Error("Usage: NEW_PASSWORD=<min 10 chars> set-password <email>");
    const u = await auth.getUserByEmail(email);
    await auth.updateUser(u.uid, { password: pw });
    console.log(`Password updated for ${email}`);
  } else {
    throw new Error("Unknown command. Use: company | platform-admin | customer-success | show | set-password");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
