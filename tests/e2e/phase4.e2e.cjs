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
  await c.getByTestId("kpi-completion-demo").getByText(`${E.received} dari 50 laporan masuk`).waitFor();
  await c.getByTestId("kpi-score-demo").getByText(`${E.avg}/100`).waitFor();
  await c.getByTestId("kpi-emission-demo").getByText(`${E.tco2} tCO₂e`).waitFor();
  await c.getByTestId("kpi-completion-trial").getByText("0 dari 0 laporan masuk").waitFor();
  if (shots) await c.screenshot({ path: `${shots}/p4-01-overview-seeded.png`, fullPage: true });
  ok("overview renders seeded KPIs equal to the workbook (Simulasi and Trial shown separately)");
  await c.getByRole("button", { name: "Simulasi", exact: true }).click();
  if (await c.getByTestId("kpi-completion-trial").count()) throw new Error("trial group should be hidden under Simulasi filter");
  await c.getByRole("button", { name: "Semua", exact: true }).click();
  ok("source filter Semua / Simulasi switches groups without blending");

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
  await c.getByTestId("kpi-completion-trial").getByText("0 dari 1 laporan masuk").waitFor({ timeout: 15000 });
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
  await c.getByTestId("kpi-completion-trial").getByText("1 dari 1 laporan masuk").waitFor({ timeout: 15000 });
  await c.getByTestId("kpi-verification-trial").getByText("0/1").waitFor();
  await c.getByTestId("recent-activity").getByText(/SUP-101.*mengirim laporan/).waitFor({ timeout: 15000 });
  await c.getByTestId("kpi-completion-demo").getByText(`${E.received} dari 50 laporan masuk`).waitFor();
  await c.getByTestId("kpi-score-demo").getByText(`${E.avg}/100`).waitFor();
  if (shots) await c.screenshot({ path: `${shots}/p4-03-overview-live.png`, fullPage: true });
  ok("dashboard updated without refresh; simulated KPIs unchanged");
  await nav(c, "Pemasok");
  await c.getByLabel("Cari pemasok").fill(""); // the page keeps its earlier search when revisited
  await c.getByRole("button", { name: "Trial", exact: true }).click();
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
  await b.getByTestId("kpi-completion-trial").getByText("0 dari 0 laporan masuk").waitFor();
  await nav(b, "Verifikasi");
  await b.getByText("Tidak ada laporan yang menunggu verifikasi.").waitFor();
  await b.goto(BASE + "/c/pemasok/SUP-101");
  await b.getByText("Pemasok ini tidak terhubung dengan perusahaan Anda.").waitFor();
  ok("company B cannot see the supplier, its report or its queue item");

  // 8. Reviewer A decides
  await c.getByRole("button", { name: "Semua", exact: true }).click();
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
  await c.getByTestId("kpi-verification-trial").getByText("1/1").waitFor({ timeout: 15000 });
  await c.getByTestId("kpi-score-demo").getByText(`${E.avg}/100`).waitFor();
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
