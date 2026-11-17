/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script using the preinstalled Playwright */
// Phase 3 browser test: seeded workbook visible as simulation; live report reviewed by an authorized company.
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const [connectCode, claimCode] = process.argv.slice(2);
const shots = process.env.SHOTS_DIR;

async function login(page, email) {
  await page.goto(BASE + "/masuk");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill("rahasia123");
  await page.getByRole("button", { name: "Masuk" }).click();
}
async function register(page, { name, business, email, wa, invite }) {
  await page.goto(BASE + "/daftar");
  if (invite) { await page.getByRole("tab", { name: "Punya kode undangan" }).click(); await page.getByLabel("Kode undangan").fill(invite); }
  await page.getByLabel("Nama penanggung jawab").fill(name);
  if (!invite) await page.getByLabel("Nama usaha").fill(business);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Nomor WhatsApp").fill(wa);
  await page.getByLabel("Buat kata sandi").fill("rahasia123");
  await page.getByLabel("Konfirmasi kata sandi").fill("rahasia123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Daftar" }).click();
  await page.waitForURL("**/s");
}

(async () => {
  const browser = await chromium.launch();
  const ok = (m) => console.log("PASS", m);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await phone.newPage();
  globalThis.__page = p;

  // Seeded supplier claims its profile and sees simulated history, clearly labelled
  await register(p, { name: "Ibu Empat", email: "empat@umkm.test", wa: "081300000004", invite: claimCode });
  await p.getByText("Halo, Pemasok 04!").waitFor();
  await p.getByText("Mode demo: tanggal acuan").waitFor();
  await p.goto(BASE + "/s/laporan");
  await p.getByText("Laporan Maret 2027").waitFor();
  await p.getByText("Data Simulasi").first().waitFor();
  await p.goto(BASE + "/s/hasil");
  await p.getByText("Skor simulasi (workbook)").first().waitFor();
  await p.getByText("Data simulasi").first().waitFor();
  if (shots) await p.screenshot({ path: `${shots}/p3-01-simulated-results.png`, fullPage: true });
  ok("claimed seeded supplier sees workbook reports and scores labelled as simulation");
  await p.goto(BASE + "/s/laporan/2027-03");
  await p.getByText("Tidak masuk alur verifikasi").waitFor();
  await p.goto(BASE + "/s/laporan/2027-03/isi");
  await p.waitForURL("**/s/laporan/2027-03");
  ok("simulated report is read-only and outside the verification workflow");
  await p.goto(BASE + "/s/profil");
  await p.getByRole("button", { name: "Keluar" }).click();
  await p.waitForURL("**/masuk");

  // New live supplier
  await register(p, { name: "Rina", business: "Roti Rina", email: "rina@umkm.test", wa: "081377788899" });
  await p.goto(BASE + "/s/perusahaan");
  await p.getByLabel("Kode perusahaan").fill(connectCode);
  await p.getByRole("button", { name: "Hubungkan" }).click();
  await p.getByText("Terhubung dengan Perusahaan Mitra A.").waitFor();
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
  await p.getByRole("link", { name: "Lihat status laporan" }).click();
  await p.getByText("Estimasi emisi & penilaian").waitFor();
  await p.getByText("Sementara — belum diverifikasi").waitFor();
  await p.getByText("Skor akhir belum tersedia").waitFor();
  await p.getByText("Bukti Belum Dapat Diverifikasi", { exact: false }).first().waitFor();
  await p.getByText("Pembanding industri belum tersedia", { exact: false }).first().waitFor();
  await p.getByText("400 kWh × 0.85").waitFor();
  await p.getByText("Dinyatakan tidak memakai (aktivitas nol)").waitFor();
  if (shots) await p.screenshot({ path: `${shots}/p3-02-provisional.png`, fullPage: true });
  ok("live submission shows emission breakdown with simulated factors and a provisional, incomplete score");

  // Company B cannot see or review it
  const lapB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const b = await lapB.newPage();
  await login(b, "reviewer@mitra-b.test");
  await b.waitForURL("**/c");
  await b.goto(BASE + "/c/verifikasi");
  await b.getByText("Tidak ada laporan yang menunggu verifikasi.").waitFor();
  await b.goto(BASE + "/c/verifikasi/SUP-101_2027-03"); // the real live report (SUP-101: 100 seeded + 1)
  await b.getByText("Anda tidak memiliki akses ke laporan ini.").waitFor();
  ok("company B sees neither the queue item nor the report");

  // Company A reviewer
  const lapA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const c = await lapA.newPage();
  await login(c, "reviewer@mitra-a.test");
  await c.waitForURL("**/c");
  await c.getByTestId("kpi-completion-demo").getByText(/dari 50 laporan masuk/).waitFor();
  await c.getByTestId("kpi-completion-trial").getByText("1 dari 1 laporan masuk").waitFor();
  await c.goto(BASE + "/c/verifikasi");
  await c.getByText("Roti Rina").waitFor();
  if ((await c.locator("tbody tr").count()) !== 1) throw new Error("queue should hold only the live report");
  ok("reviewer queue contains only the live report (no seeded rows)");
  await c.getByRole("link", { name: "Tinjau" }).click();
  await c.getByText("File bukti tidak tersimpan (mode demo)").waitFor();
  await c.getByText("Bukti Belum Dapat Diverifikasi — belum ada nilai hasil pemeriksaan.").waitFor();
  await c.getByLabel("kWh hasil pemeriksaan dokumen (opsional)").fill("300");
  await c.getByText("Tidak cocok: selisih 33.3% (toleransi 10%).").waitFor();
  await c.getByLabel("kWh hasil pemeriksaan dokumen (opsional)").fill("370");
  await c.getByText("Cocok: selisih 8.1% (toleransi 10%).").waitFor();
  await c.getByRole("button", { name: "Tolak" }).click();
  await c.getByText("Alasan wajib diisi (minimal 5 karakter)").waitFor();
  await c.getByRole("button", { name: "Setujui" }).click();
  await c.getByText("Sebutkan sumber pemeriksaan untuk nilai yang diperiksa").waitFor();
  ok("reviewer sees live 10% comparison; reason and check source are enforced");
  await c.getByLabel("Sumber pemeriksaan").selectOption("dokumen_asli");
  await c.getByLabel("Catatan / alasan").fill("Tagihan PLN Maret diperiksa langsung");
  if (shots) await c.screenshot({ path: `${shots}/p3-03-review.png`, fullPage: true });
  await c.getByRole("button", { name: "Setujui" }).click();
  await c.getByText("Keputusan tersimpan. Status: Terverifikasi.").waitFor();
  await c.getByText("Diperiksa: 370 kWh (Dokumen asli diperiksa langsung) → cocok").waitFor();
  ok("approval recorded with checked value, source and outcome in history");

  // Supplier sees it live
  await p.getByText("Terverifikasi").first().waitFor({ timeout: 10000 });
  await p.getByText("Komponen terverifikasi").waitFor({ timeout: 10000 });
  await p.getByText("Penilaian Perusahaan Mitra A (setelah pemeriksaan perusahaan)").waitFor(); // company-scoped assessment (Phase 4)
  await p.getByText("Cocok: selisih 8.1% (toleransi 10%)").waitFor();
  await p.getByText("Skor akhir belum tersedia").first().waitFor();
  await p.getByText("Disetujui perusahaan (v1)").waitFor();
  if (shots) await p.screenshot({ path: `${shots}/p3-04-verified.png`, fullPage: true });
  ok("supplier sees verification, evidence match and that no final score exists without a benchmark — live");

  await browser.close();
  console.log("ALL PHASE 3 E2E CHECKS PASSED");
})().catch(async (e) => {
  if (shots && globalThis.__page) await globalThis.__page.screenshot({ path: `${shots}/fail3.png`, fullPage: true }).catch(() => {});
  console.error("FAIL", e.message.split("\n").slice(0, 6).join(" | "));
  process.exit(1);
});
