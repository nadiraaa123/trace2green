/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script using the preinstalled Playwright */
// Browser smoke test for Phase 1 auth flows. Usage: node tests/e2e/phase1.e2e.cjs <inviteCode>
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const invite = process.argv[2];
const shots = process.env.SHOTS_DIR;

(async () => {
  const browser = await chromium.launch();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const p = await phone.newPage();
  const ok = (m) => console.log("PASS", m);
  globalThis.__page = p;

  // Test A (UI): new supplier registers
  await p.goto(BASE + "/");
  if (shots) await p.screenshot({ path: `${shots}/01-splash.png` });
  await p.getByRole("link", { name: "Mulai" }).click();
  await p.getByRole("button", { name: "Daftar" }).click(); // empty submit -> validation
  await p.getByText("Nama penanggung jawab wajib diisi").waitFor();
  ok("client validation blocks empty form");
  await p.getByLabel("Nama penanggung jawab").fill("Siti Aminah");
  await p.getByLabel("Nama usaha").fill("Kue Bu Siti");
  await p.getByLabel("Email").fill("siti@umkm.test");
  await p.getByLabel("Nomor WhatsApp").fill("081234567890");
  await p.getByLabel("Buat kata sandi").fill("rahasia123");
  await p.getByLabel("Konfirmasi kata sandi").fill("rahasia123");
  await p.getByRole("checkbox").check();
  if (shots) await p.screenshot({ path: `${shots}/02-register.png`, fullPage: true });
  await p.getByRole("button", { name: "Daftar" }).click();
  await p.waitForURL("**/s");
  await p.getByText("Halo, Kue Bu Siti!").waitFor();
  await p.getByText("SUP-101").waitFor();
  if (shots) await p.screenshot({ path: `${shots}/03-supplier-home.png` });
  ok("new supplier registered -> SUP-101, live profile read under rules");

  // Test B (UI): log out and back in, no duplicate
  await p.getByRole("button", { name: "Keluar" }).click();
  await p.waitForURL("**/masuk");
  await p.goto(BASE + "/masuk");
  await p.getByLabel("Email").fill("siti@umkm.test");
  await p.getByLabel("Kata sandi").fill("rahasia123");
  await p.getByRole("button", { name: "Masuk" }).click();
  await p.waitForURL("**/s");
  await p.getByText("SUP-101").waitFor();
  ok("existing supplier logs in again -> same SUP-101");
  await p.getByRole("button", { name: "Keluar" }).click();
  await p.waitForURL("**/masuk");

  // Wrong password message
  await p.goto(BASE + "/masuk");
  await p.getByLabel("Email").fill("siti@umkm.test");
  await p.getByLabel("Kata sandi").fill("salahsalah");
  await p.getByRole("button", { name: "Masuk" }).click();
  await p.getByText("Email atau kata sandi salah.").waitFor();
  ok("wrong password shows Indonesian error");

  // Test E (UI): claim seeded SUP-002 via invite code
  await p.goto(BASE + "/daftar");
  await p.getByRole("tab", { name: "Punya kode undangan" }).click();
  await p.getByLabel("Kode undangan").fill(invite);
  await p.getByLabel("Nama penanggung jawab").fill("Budi Santoso");
  await p.getByLabel("Email").fill("budi@umkm.test");
  await p.getByLabel("Nomor WhatsApp").fill("081298765432");
  await p.getByLabel("Buat kata sandi").fill("rahasia123");
  await p.getByLabel("Konfirmasi kata sandi").fill("rahasia123");
  await p.getByRole("checkbox").check();
  await p.getByRole("button", { name: "Daftar" }).click();
  await p.waitForURL("**/s");
  await p.getByText("Halo, Pemasok 02!").waitFor();
  ok("invite code links account to seeded SUP-002");
  await p.getByRole("button", { name: "Keluar" }).click();
  await p.waitForURL("**/masuk");

  // Same code again must fail
  await p.goto(BASE + "/daftar");
  await p.getByRole("tab", { name: "Punya kode undangan" }).click();
  await p.getByLabel("Kode undangan").fill(invite);
  await p.getByLabel("Nama penanggung jawab").fill("Penyusup");
  await p.getByLabel("Email").fill("intruder@umkm.test");
  await p.getByLabel("Nomor WhatsApp").fill("081211112222");
  await p.getByLabel("Buat kata sandi").fill("rahasia123");
  await p.getByLabel("Konfirmasi kata sandi").fill("rahasia123");
  await p.getByRole("checkbox").check();
  await p.getByRole("button", { name: "Daftar" }).click();
  await p.getByText("Kode undangan sudah dipakai.").waitFor();
  ok("reused invite rejected");
  // intruder now has an auth account without a role -> resume screen, not a portal
  await p.getByRole("heading", { name: "Lengkapi profil usaha" }).waitFor();
  await p.goto(BASE + "/s");
  await p.waitForURL("**/daftar");
  ok("account without role cannot enter supplier portal");
  await p.getByRole("button", { name: "Keluar" }).click();
  await p.waitForURL("**/masuk");

  // Company admin login
  const laptop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const c = await laptop.newPage();
  await c.goto(BASE + "/masuk");
  await c.getByLabel("Email").fill("admin@mitra-a.test");
  await c.getByLabel("Kata sandi").fill("rahasia123");
  await c.getByRole("button", { name: "Masuk" }).click();
  await c.waitForURL("**/c");
  await c.getByText("Perusahaan Mitra A").waitFor();
  await c.getByText("Pemasok terhubung: 3").waitFor();
  ok("company admin sees own company and its 3 related suppliers");
  await c.goto(BASE + "/s");
  await c.waitForURL("**/c");
  ok("company admin redirected away from supplier portal");

  await browser.close();
  console.log("ALL PHASE 1 E2E CHECKS PASSED");
})().catch(async (e) => { if (shots && globalThis.__page) await globalThis.__page.screenshot({ path: `${shots}/fail.png`, fullPage: true }).catch(()=>{}); console.error("FAIL", e.message.split("\n").slice(0,6).join(" | ")); process.exit(1); });
