/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script using the preinstalled Playwright */
// Phase 4 browser test: seeded company dashboard + full phone-to-laptop demo scenario, all live (no reloads on the laptop).
const { chromium } = require("playwright");
const fs = require("node:fs");
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const E = JSON.parse(process.argv[2]);
const shots = process.env.SHOTS_DIR;

async function login(page, email) {
  await page.goto(BASE + "/masuk");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill("rahasia123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL("**/c");
}
// Next keeps hidden copies of visited pages; only click the visible filter button.
const pick = (page, label) => page.locator("button:visible").filter({ hasText: new RegExp(`^${label}$`) }).first().click();
const nav = (page, name) => page.getByRole("navigation", { name: "Menu perusahaan" }).getByRole("link", { name }).click();

(async () => {
  const browser = await chromium.launch();
  const ok = (m) => console.log("PASS", m);
  const laptop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, deviceScaleFactor: shots ? 2 : 1 });
  const c = await laptop.newPage();
  globalThis.__page = c;

  // 1. Seeded dashboard
  await login(c, "reviewer@mitra-a.test");
  await c.getByRole("heading", { name: "Ringkasan" }).waitFor();
  await c.getByTestId("kpi-suppliers").getByText("50", { exact: true }).waitFor();
  await c.getByTestId("kpi-reports").getByText(`${E.received} dari 50`).waitFor();
  await c.getByTestId("kpi-emission").getByText(`${E.tco2} ton CO₂e`).waitFor();
  await c.getByTestId("demo-note").getByText("Dashboard demonstrasi — mencakup data simulasi dan uji coba.").waitFor();
  if (await c.getByRole("button", { name: "Simulasi", exact: true }).count()) throw new Error("dashboard must not show the source filter");
  if (shots) await c.screenshot({ path: `${shots}/p4-01-overview-seeded.png`, fullPage: true });
  ok("overview renders seeded KPIs equal to the workbook (Simulasi and Trial shown separately)");
  await nav(c, "Emisi & Skor");
  await c.getByTestId("avg-score-demo").getByText(`${E.avg}`).waitFor(); // averages moved here, per source
  await c.getByTestId("avg-score-trial").getByText("—").waitFor();
  await c.getByRole("link", { name: "Cara Penilaian" }).click();
  await c.getByTestId("example").getByText("81").waitFor();
  await c.getByTestId("disclaimer").waitFor();
  if (shots) await c.screenshot({ path: `${shots}/p5-02-cara-penilaian.png`, fullPage: true });
  await nav(c, "Ringkasan");
  ok("simple unified KPIs + demo note on dashboard; per-source averages and scoring method on Emisi & Skor");

  // 2. Suppliers directory
  await nav(c, "Pemasok");
  await c.getByText("50 pemasok · halaman 1 dari 5").waitFor();
  await c.getByLabel("Cari pemasok").fill("Pemasok 04");
  await c.getByTestId("supplier-table").getByText("SUP-004").waitFor();
  await c.getByRole("link", { name: "Profil Pemasok 04" }).click();
  await c.getByText("Riwayat Pelaporan & Kinerja Lingkungan").waitFor();
  await c.getByText("Maret 2027").first().waitFor();
  if (shots) await c.screenshot({ path: `${shots}/p4-02-supplier-profile.png`, fullPage: true });
  ok("supplier search, pagination and profile with monthly history");

  // 3. Company creates a connect code in Settings
  await nav(c, "Pengaturan");
  await c.getByTestId("create-connect-code").click();
  const code = (await c.getByTestId("invite-code").innerText()).trim().slice(0, 8);
  if (!/^[A-Z2-9]{8}$/.test(code)) throw new Error("bad code " + code);
  ok("invitation code created from Settings");
  await nav(c, "Ringkasan");
  await c.getByRole("heading", { name: "Ringkasan" }).waitFor();

  // 4. Phone: new UMKM registers, connects, submits
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: shots ? 2 : 1 });
  const p = await phone.newPage();
  await p.goto(BASE + "/daftar");
  await p.getByLabel("Nama penanggung jawab").fill("Rina");
  await p.getByLabel("Nama usaha").fill("Roti Rina");
  await p.getByLabel("Email").fill("rina@umkm.test");
  await p.getByLabel("Nomor WhatsApp").fill("081377788899");
  await p.getByLabel("Buat kata sandi").fill("rahasia123");
  await p.getByLabel("Konfirmasi kata sandi").fill("rahasia123");
  await p.getByRole("checkbox").check();
  await p.getByRole("button", { name: "Daftar" }).click();
  await p.waitForURL("**/s");
  await p.goto(BASE + "/s/perusahaan");
  await p.getByLabel("Kode perusahaan").fill(code);
  await p.getByRole("button", { name: "Hubungkan" }).click();
  await p.getByText("Terhubung dengan Perusahaan Mitra A.").waitFor();
  // Laptop updates live: one trial supplier, nothing received yet
  await c.getByTestId("kpi-reports").getByText(`${E.received} dari 51`).waitFor({ timeout: 15000 });
  await c.getByTestId("kpi-suppliers").getByText("51", { exact: true }).waitFor();
  ok("new supplier appears on the laptop dashboard live after connecting");

  await p.goto(BASE + "/s/laporan/baru");
  await p.getByRole("button", { name: "Mulai laporan Maret 2027" }).click();
  await p.waitForURL("**/isi");
  await p.getByLabel("Sektor usaha").selectOption("Roti & kue");
  await p.getByLabel("Produk utama").fill("Roti tawar");
  await p.getByLabel("Jumlah produksi").fill("2.000");
  await p.getByLabel("Satuan").selectOption("pcs");
  await p.getByLabel("Jumlah pekerja").fill("3");
  await p.getByRole("button", { name: "Lanjut" }).click();
  await p.getByLabel("Pemakaian listrik").fill("400");
  await p.getByLabel("Tidak memakai BBM/LPG").check();
  await p.getByLabel("Berat kemasan dipakai").fill("20");
  await p.getByLabel("Jumlah limbah").fill("10");
  await p.getByRole("button", { name: "Lokal" }).click();
  await p.getByRole("button", { name: "Motor" }).click();
  await p.getByLabel("Total jarak pengiriman").fill("300");
  await p.getByRole("button", { name: "Sebagian" }).click();
  await p.getByText("Draf tersimpan").waitFor({ timeout: 10000 });
  await p.getByRole("button", { name: "Lanjut" }).click();
  await p.getByRole("button", { name: "Lanjut" }).click();
  await p.getByRole("button", { name: "Kirim Laporan" }).click();
  await p.getByRole("heading", { name: "Laporan terkirim" }).waitFor();
  ok("supplier submitted March 2027 from the phone");

  // 5–6. Laptop: live update, Trial filter, demo untouched
  await c.getByTestId("kpi-reports").getByText(`${E.received + 1} dari 51`).waitFor({ timeout: 15000 });
  await c.getByTestId("recent-activity").getByText(/Roti Rina mengirim laporan Maret 2027/).waitFor({ timeout: 15000 });
  if (shots) await c.screenshot({ path: `${shots}/p4-03-overview-live.png`, fullPage: true });
  ok("dashboard updated without refresh; simulated KPIs unchanged");
  await nav(c, "Pemasok");
  await c.getByLabel("Cari pemasok").fill(""); // the page keeps its earlier search when revisited
  await pick(c, "Trial");
  await c.getByText("1 pemasok · halaman 1 dari 1").waitFor();
  await c.getByTestId("supplier-table").getByText("SUP-101").waitFor();
  await c.getByTestId("supplier-table").getByText("Menunggu Verifikasi").waitFor();
  ok("new supplier listed under the Trial filter only");
  await nav(c, "Pengumpulan Data");
  await c.getByTestId("activity-table").getByText("Roti Rina").waitFor();
  await c.getByTestId("activity-table").getByText("0*").waitFor(); // declared not used
  ok("activity table shows the live report; 'tidak memakai' rendered as genuine zero");

  // 7. Company B sees nothing of it
  const lapB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const b = await lapB.newPage();
  await login(b, "reviewer@mitra-b.test");
  await b.getByTestId("kpi-suppliers").getByText("50", { exact: true }).waitFor(); // B does not gain A's new supplier
  await nav(b, "Verifikasi");
  await b.getByText("Tidak ada laporan yang menunggu verifikasi.").waitFor();
  await b.goto(BASE + "/c/pemasok/SUP-101");
  await b.getByText("Pemasok ini tidak terhubung dengan perusahaan Anda.").waitFor();
  ok("company B cannot see the supplier, its report or its queue item");

  // 8. Reviewer A decides
  await nav(c, "Verifikasi");
  await c.getByTestId("table-queue").getByText("Roti Rina").waitFor();
  await c.getByRole("link", { name: "Tinjau" }).click();
  await c.getByLabel("kWh hasil pemeriksaan dokumen (opsional)").fill("390");
  await c.getByLabel("Sumber pemeriksaan").selectOption("dokumen_asli");
  await c.getByLabel("Catatan / alasan").fill("Tagihan PLN diperiksa langsung");
  await c.getByRole("button", { name: "Setujui" }).click();
  await c.getByText("Keputusan tersimpan. Status: Terverifikasi.").waitFor();
  await c.getByTestId("demo-benchmark-note").waitFor();
  if (shots) await c.screenshot({ path: `${shots}/p4-04-review-decided.png`, fullPage: true });
  ok("reviewer approved with a checked value; demo benchmark explicitly labeled");
  await nav(c, "Verifikasi");
  await c.getByRole("tab", { name: /Riwayat keputusan/ }).click();
  await c.getByTestId("decision-history").getByText(/SUP-101/).waitFor();
  ok("company-specific decision history");

  // 9. Supplier sees it immediately
  await p.getByRole("link", { name: "Lihat status laporan" }).click();
  await p.getByText("Terverifikasi").first().waitFor({ timeout: 15000 });
  await p.getByText("Penilaian Perusahaan Mitra A (setelah pemeriksaan perusahaan)").waitFor();
  await p.getByTestId("demo-benchmark-note").first().waitFor();
  if (shots) await p.screenshot({ path: `${shots}/p4-05-phone-verified.png`, fullPage: true });
  ok("supplier sees the verified status and the company's labeled assessment live");

  // 10. Analytics reflect the new record; demo values intact; CSV export
  await nav(c, "Ringkasan");
  await nav(c, "Verifikasi");
  await c.getByTestId("verification-summary").getByText("Terverifikasi").waitFor();
  await c.getByTestId("verification-summary").locator("div", { hasText: "Terverifikasi" }).getByText("1", { exact: true }).waitFor({ timeout: 15000 });
  // Fresh page loads (no hidden copies of earlier pages kept by the client router).
  await c.goto(BASE + "/c/emisi-skor");
  await pick(c, "Semua"); // the Trial filter chosen earlier persists on detail pages
  await c.getByTestId("avg-score-demo").getByText(`${E.avg}`).waitFor(); // simulated average unchanged
  await c.goto(BASE + "/c/pemasok/SUP-101");
  await c.getByRole("link", { name: "Rincian skor" }).click();
  await c.getByTestId("components").getByText("Kecocokan Bukti").waitFor();
  await c.getByText("Diperiksa: 390 kWh (Dokumen asli diperiksa langsung) → cocok").waitFor();
  await c.getByText("benchmark simulasi — hanya demonstrasi", { exact: false }).waitFor();
  if (await c.getByTestId("suggestions").getByText("Siapkan tagihan listrik", { exact: false }).count()) throw new Error("stale evidence suggestion after a matching check");
  if (shots) await c.screenshot({ path: `${shots}/p5-03-score-detail.png`, fullPage: true });
  await nav(c, "Laporan");
  const [dl] = await Promise.all([c.waitForEvent("download"), c.getByTestId("csv-export").click()]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  const lines = csv.trim().split("\n");
  if (lines.length !== 52) throw new Error(`CSV should have header + 51 rows, got ${lines.length}`);
  if (!/SUP-101,Roti Rina,trial/.test(csv) || (csv.match(/demo \(simulasi\)/g) || []).length !== 50) throw new Error("CSV source labels wrong");
  if (!csv.includes("bukan laporan resmi PSPK")) throw new Error("CSV disclaimer missing");
  ok("CSV export: 50 simulated + 1 trial row, source labels and disclaimer");

  if (shots) {
    for (const [name, file] of [["Emisi & Skor", "p4-06-emissions"], ["Insight & Rekomendasi", "p4-07-insights"], ["Pengumpulan Data", "p4-08-collection"], ["Pengaturan", "p4-09-settings"]]) {
      await nav(c, name);
      await c.waitForTimeout(800);
      await c.screenshot({ path: `${shots}/${file}.png`, fullPage: true });
    }
    await p.goto(BASE + "/s");
    await p.getByText("Halo, Roti Rina!").waitFor();
    await p.screenshot({ path: `${shots}/p4-10-phone-home.png`, fullPage: true });
  }
  await browser.close();
  console.log("ALL PHASE 4 E2E CHECKS PASSED");
})().catch(async (e) => {
  if (shots && globalThis.__page) await globalThis.__page.screenshot({ path: `${shots}/fail4.png`, fullPage: true }).catch(() => {});
  console.error("FAIL", e.message.split("\n").slice(0, 6).join(" | "));
  process.exit(1);
});
