/**
 * Controlled provisioning of company admins and the platform admin.
 * Company accounts are never self-registered.
 *
 *   npx tsx scripts/provision.ts company <companyId> "<Company name>" <email> <password> [demo|trial|production]
 *   npx tsx scripts/provision.ts platform-admin <email> <password>
 *
 * Passwords are passed on the command line for local/demo setup only; for a real
 * deployment create the user in the Firebase console and run with an existing email.
 */
import { FieldValue } from "firebase-admin/firestore";
import { auth, db, target } from "./_admin";

async function upsertUser(email: string, password: string, displayName: string) {
  try {
    const u = await auth.getUserByEmail(email);
    return u;
  } catch {
    return auth.createUser({ email, password, displayName, emailVerified: true });
  }
}

async function main() {
  const [kind, ...args] = process.argv.slice(2);
  console.log(`Target: ${target}`);
  const now = FieldValue.serverTimestamp();

  if (kind === "company") {
    const [companyId, name, email, password, ds = "demo"] = args;
    if (!/^CMP-[A-Z0-9]+$/.test(companyId ?? "") || !name || !email || !password) {
      throw new Error("Usage: company <CMP-X> <name> <email> <password> [dataSource]");
    }
    const user = await upsertUser(email, password, `Admin ${name}`);
    const existingRole = user.customClaims?.role;
    if (existingRole && existingRole !== "company_admin") {
      throw new Error(`${email} already has role ${existingRole}; refusing to change it.`);
    }
    await db.doc(`companies/${companyId}`).set(
      { companyId, name, plan: "trial", dataSource: ds, isSimulated: ds === "demo", createdAt: now, updatedAt: now },
      { merge: true },
    );
    await db.doc(`users/${user.uid}`).set({
      uid: user.uid, email, displayName: `Admin ${name}`, role: "company_admin",
      companyId, supplierId: null, dataSource: ds, isSimulated: false, createdAt: now, updatedAt: now,
    }, { merge: true });
    await auth.setCustomUserClaims(user.uid, { role: "company_admin", companyId });
    console.log(`Company admin ${email} -> ${companyId}`);
  } else if (kind === "platform-admin") {
    const [email, password] = args;
    const user = await upsertUser(email, password, "Platform Admin");
    await db.doc(`users/${user.uid}`).set({
      uid: user.uid, email, displayName: "Platform Admin", role: "platform_admin",
      companyId: null, supplierId: null, dataSource: "demo", isSimulated: false, createdAt: now, updatedAt: now,
    }, { merge: true });
    await auth.setCustomUserClaims(user.uid, { role: "platform_admin" });
    console.log(`Platform admin ${email}`);
  } else {
    throw new Error("Unknown command. Use: company | platform-admin");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
