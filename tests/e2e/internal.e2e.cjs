/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script using the preinstalled Playwright */
// Internal workspaces: Platform Admin assigns CS, sets trial & lifecycle; CS sees only its portfolio, live.
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const IDS = JSON.parse(process.argv[2]);
const shots = process.env.SHOTS_DIR;

async function login(page, email, path) {
  await page.goto(BASE + "/masuk");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill(process.env.PW || "rahasia123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL(`**${path}`);
}
const ok = (m) => console.log("PASS", m);
const nav = (page, menu, name) => page.getByRole("navigation", { name: menu }).getByRole("link", { name }).click();

(async () => {
  const browser = await chromium.launch();
  const ctx = (o = {}) => browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: shots ? 2 : 1, ...o });
  const a = await (await ctx()).newPage();
  globalThis.__page = a;

  // 1. Platform Admin overview: actual numbers only
  await login(a, "admin@trace2green.test", "/admin");
  await a.getByRole("heading", { name: "Ringkasan Platform" }).waitFor();
  await a.getByTestId("admin-suppliers").getByText("102", { exact: true }).waitFor(); // 100 analytical + 2 live; scenario NOT counted
  await a.getByTestId("admin-lifecycle").getByText("2", { exact: true }).waitFor();
  await a.getByTestId("stage-distribution").locator("li", { hasText: "Onboarding" }).getByText("2", { exact: true }).waitFor();
  if (shots) await a.screenshot({ path: `${shots}/i-01-admin-overview.png`, fullPage: true });
  ok("admin overview: actual counts (102 profiles, 2 tracked); 880 scenario profiles excluded");

  // 2. Company trial plan, then CS assignment + trial for a live supplier
  await nav(a, "Menu Platform Admin", "Perusahaan & Langganan");
  await a.getByTestId("admin-companies-table").getByText("Perusahaan Mitra A").click();
  await a.getByLabel("Status langganan").selectOption("trial");
  await a.getByLabel("Tahun trial").fill("2028");
  await a.getByRole("button", { name: "Simpan" }).click();
  await a.getByText("Status langganan disimpan.").waitFor();
  await a.getByTestId("admin-companies-table").getByText("Jan–Mar 2028").waitFor();
  ok("company subscription recorded (trial Jan–Mar 2028), separate from supplier stage");

  await nav(a, "Menu Platform Admin", "Pemasok & Siklus");
  await a.getByTestId("admin-lifecycle-table").getByText(IDS.a).click();
  await a.getByLabel("Tugaskan CS").selectOption("CS-001");
  await a.getByRole("button", { name: "Simpan penugasan" }).click();
  await a.getByText("Penugasan CS disimpan.").waitFor();
  await a.getByTestId("admin-lifecycle-table").locator("tr", { hasText: IDS.a }).getByText("CS-001").waitFor();
  await a.getByTestId("admin-lifecycle-table").getByText(IDS.b).click();
  await a.getByLabel("Tugaskan CS").selectOption("CS-002");
  await a.getByRole("button", { name: "Simpan penugasan" }).click();
  await a.getByText("Penugasan CS disimpan.").waitFor();
  ok("one primary CS assigned per supplier");

  // Paid status without confirmation is impossible from the UI/API
  await a.getByTestId("admin-lifecycle-table").getByText(IDS.a).click();
  await a.getByLabel("Status baru").selectOption("trial");
  await a.getByLabel("Tahun trial").fill("2028");
  await a.getByRole("button", { name: "Simpan status" }).click();
  await a.getByText("Status diperbarui.").waitFor();
  await a.getByTestId("admin-lifecycle-table").locator("tr", { hasText: IDS.a }).getByText("Trial Berlangsung").waitFor();
  await a.getByLabel("Status baru").selectOption("active_subscription");
  await a.getByRole("button", { name: "Simpan status" }).click();
  await a.getByText("Nomor referensi konfirmasi wajib diisi", { exact: false }).waitFor();
  ok("trial started within the company quota; active status refused without confirmation");

  // 3. Scenario page: projection, separate, paginated from Firestore
  await nav(a, "Menu Platform Admin", "Skenario 2027–2031");
  await a.getByTestId("projection-note").first().waitFor();
  await a.getByTestId("financial-table").locator("tr", { hasText: "Pemasok berbayar" }).getByText("880").waitFor();
  await a.getByText("880 dari 880 profil pemasok skenario tertulis").waitFor();
  await a.getByTestId("scenario-suppliers-table").getByText("SCN-S0001").waitFor();
  await a.getByText("Halaman 1 dari 59").waitFor();
  await a.getByRole("button", { name: "Halaman berikutnya" }).click();
  await a.getByTestId("scenario-suppliers-table").getByText("SCN-S0016").waitFor();
  await a.getByLabel("Tahun").selectOption("2027");
  await a.getByText("Menampilkan 1–15 dari 40").waitFor({ timeout: 10000 });
  if (shots) await a.screenshot({ path: `${shots}/i-02-admin-scenario.png`, fullPage: true });
  ok("scenario: 880 projected suppliers paged 15 per page (59 pages); 2027 shows only 40");

  await nav(a, "Menu Platform Admin", "Tim Customer Success");
  await a.getByTestId("cs-directory").getByText("CS-001").waitFor();
  await a.getByTestId("scenario-cs-summary").getByText("13").waitFor();
  ok("CS directory with workloads; scenario 2031 = 13 CS");

  // 4. CS-001 sees only its own supplier, live
  const c = await (await ctx()).newPage();
  await login(c, "sari@trace2green.test", "/cs");
  await c.getByTestId("cs-table").getByText(IDS.a).waitFor();
  if (await c.getByTestId("cs-table").getByText(IDS.b).count()) throw new Error("CS-001 must not see CS-002's supplier");
  await c.getByTestId("cs-capacity").getByText("1 / 70").waitFor();
  await c.getByTestId("cs-table").getByText(IDS.a).click();
  await c.getByLabel("Catatan tindak lanjut").fill("Bantu isi laporan Januari");
  await c.getByLabel("Butuh bantuan").check();
  await c.getByRole("button", { name: "Simpan tindak lanjut" }).click();
  await c.getByTestId("cs-followups").getByText("Bantu isi laporan Januari").waitFor({ timeout: 15000 });
  if (await c.getByLabel("Status baru").locator("option", { hasText: "Aktif" }).count()) throw new Error("CS must not be offered paid statuses");
  if (shots) await c.screenshot({ path: `${shots}/i-03-cs-portfolio.png`, fullPage: true });
  ok("CS sees only its portfolio (1/70), records follow-ups live, cannot set paid status");

  // Admin sees the flag live
  await a.goto(BASE + "/admin");
  await a.getByText("Roti Rina").first().waitFor({ timeout: 15000 });
  ok("platform admin sees the CS follow-up flag");

  // 5. Role separation
  await c.goto(BASE + "/admin");
  await c.waitForURL("**/cs");
  const co = await (await ctx()).newPage();
  await login(co, "reviewer@mitra-a.test", "/c");
  await co.goto(BASE + "/cs");
  await co.waitForURL("**/c");
  await co.goto(BASE + "/admin");
  await co.waitForURL("**/c");
  ok("CS cannot open admin; company admin cannot open CS or admin workspaces");

  // 6. Scenario CS account: projection portfolio only
  const s = await (await ctx()).newPage();
  process.env.PW = "rahasia-demo-123";
  await login(s, "cs13@scenario.trace2green.test", "/cs");
  await s.getByText("Belum ada pemasok yang ditugaskan kepada Anda", { exact: false }).waitFor(); // no real suppliers
  await nav(s, "Menu Customer Success", "Skenario 2027–2031");
  await s.getByText("Pemasok proyeksi 2031: 40 / 70").waitFor();
  await s.getByLabel("Tahun skenario").selectOption("2030");
  await s.getByText("Belum ada pemasok proyeksi pada 2030", { exact: false }).waitFor();
  ok("scenario CS-S13: 40 projected suppliers in 2031, none before; no real portfolio");

  await browser.close();
  console.log("ALL INTERNAL E2E CHECKS PASSED");
})().catch(async (e) => {
  console.error("FAIL", e.message);
  if (globalThis.__page) await globalThis.__page.screenshot({ path: "/tmp/t2g-internal-fail.png", fullPage: true }).catch(() => {});
  process.exit(1);
});
