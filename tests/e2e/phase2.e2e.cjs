/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script using the preinstalled Playwright */
// Phase 2 browser test: full supplier reporting workflow + live company view.
// Requires a build with NEXT_PUBLIC_REPORTING_REFERENCE_DATE=2027-04-05.
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const connectCode = process.argv[2];
const shots = process.env.SHOTS_DIR;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

(async () => {
  const browser = await chromium.launch();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const p = await phone.newPage();
  globalThis.__page = p;
  const ok = (m) => console.log("PASS", m);
  const shot = (n) => shots && p.screenshot({ path: `${shots}/${n}.png`, fullPage: true });

  // Register
  await p.goto(BASE + "/daftar");
  await p.getByLabel("Nama penanggung jawab").fill("Rina Wati");
  await p.getByLabel("Nama usaha").fill("Roti Rina");
  await p.getByLabel("Email").fill("rina@umkm.test");
  await p.getByLabel("Nomor WhatsApp").fill("081377788899");
  await p.getByLabel("Buat kata sandi").fill("rahasia123");
  await p.getByLabel("Konfirmasi kata sandi").fill("rahasia123");
  await p.getByRole("checkbox").check();
  await p.getByRole("button", { name: "Daftar" }).click();
  await p.waitForURL("**/s");
  await p.getByText("Pelaporan Lingkungan Jadi").waitFor();
  await p.getByText("Halo, Roti Rina!").waitFor();
  await p.getByText("Status Maret 2027").waitFor();
  await p.getByText("Belum Dinilai").waitFor();
  await shot("p2-01-home");
  ok("homepage shows hero, period status, score and company cards");

  // Business profile
  await p.goto(BASE + "/s/profil");
  await p.getByLabel("Sektor usaha").selectOption("Roti & kue");
  await p.getByLabel("Wilayah").selectOption("Bekasi");
  await p.getByLabel("Produk utama").fill("Roti tawar");
  await p.getByLabel("Jumlah pekerja").fill("3");
  await p.getByRole("button", { name: "Simpan profil" }).click();
  await p.getByText("Profil usaha tersimpan.").waitFor();
  ok("business profile saved under rules");

  // Connect to company with consent
  await p.goto(BASE + "/s/perusahaan");
  await p.getByLabel("Kode perusahaan").fill(connectCode);
  await p.getByRole("button", { name: "Hubungkan" }).click();
  await p.getByText("Terhubung dengan Perusahaan Mitra A.").waitFor();
  await p.getByRole("switch", { name: /Perusahaan Mitra A/ }).waitFor();
  ok("connected to Perusahaan Mitra A with data sharing");

  // Company watches live
  const laptop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const c = await laptop.newPage();
  await c.goto(BASE + "/masuk");
  await c.getByLabel("Email").fill("admin@mitra-a.test");
  await c.getByLabel("Kata sandi").fill("rahasia123");
  await c.getByRole("button", { name: "Masuk" }).click();
  await c.waitForURL("**/c");
  await c.getByText("Laporan diterima (real-time): 0").waitFor();

  // New report
  await p.goto(BASE + "/s");
  await p.getByRole("link", { name: "Isi Laporan Bulanan" }).click();
  await p.waitForURL("**/s/laporan/baru");
  await p.getByRole("button", { name: "Mulai laporan Maret 2027" }).click();
  await p.waitForURL("**/s/laporan/2027-03/isi");
  if ((await p.getByLabel("Nama usaha").inputValue()) !== "Roti Rina") throw new Error("business name not prefilled");
  if ((await p.getByLabel("Sektor usaha").inputValue()) !== "Roti & kue") throw new Error("sector not prefilled");
  await p.getByLabel("Jumlah produksi").fill("2.870");
  await p.getByLabel("Satuan").selectOption("pcs");
  ok("draft created; profile prefilled, activity empty");
  await shot("p2-02-step1");
  await p.getByRole("button", { name: "Lanjut" }).click();

  // Step 2 with validation, not-applicable and Indonesian decimals
  await p.getByLabel("Pemakaian listrik").fill("12a");
  await p.getByText("Hanya angka, contoh 1.250 atau 28,9").waitFor();
  await p.getByText("Perbaiki isian yang salah agar bisa disimpan").waitFor();
  ok("invalid number blocked and autosave paused");
  await p.getByLabel("Pemakaian listrik").fill("1250");
  await p.getByText("Terbaca: 1.250 kWh").waitFor();
  await p.getByLabel("Tidak memakai BBM/LPG").check();
  await p.getByLabel("Berat kemasan dipakai").fill("28,9");
  await p.getByRole("button", { name: "Lokal" }).click();
  await p.getByRole("button", { name: "Motor" }).click();
  await p.getByLabel("Total jarak pengiriman").fill("250");
  await p.getByRole("button", { name: "Sebagian" }).click();
  await p.getByText("Draf tersimpan").waitFor({ timeout: 10000 });
  await shot("p2-03-step2");
  ok("activity data autosaved");

  // Resume draft after reload
  await p.reload();
  await p.getByLabel("Pemakaian listrik").waitFor();
  if ((await p.getByLabel("Pemakaian listrik").inputValue()) !== "1.250") throw new Error("electricity not restored");
  if (!(await p.getByLabel("Tidak memakai BBM/LPG").isChecked())) throw new Error("not-applicable not restored");
  if ((await p.getByLabel("Jumlah limbah").inputValue()) !== "") throw new Error("waste should remain empty");
  ok("draft resumed at step 2 with values; blank waste stays blank");

  // Drafts are not shared
  await c.waitForTimeout(500);
  await c.getByText("Laporan diterima (real-time): 0").waitFor();
  ok("company cannot see the draft");

  // Step 3 evidence (demo)
  await p.getByRole("button", { name: "Lanjut" }).click();
  await p.getByText("Mode demo: file tidak diunggah").waitFor();
  await p.setInputFiles("#ev-file", { name: "tagihan-maret.png", mimeType: "image/png", buffer: PNG });
  await p.getByText("tagihan-maret.png").waitFor();
  await p.getByText("Pratinjau demo · tidak tersimpan").waitFor();
  await p.setInputFiles("#ev-file", { name: "virus.html", mimeType: "text/html", buffer: Buffer.from("<b>x</b>") });
  await p.getByText("Format harus JPG, PNG, WEBP, HEIC, atau PDF").waitFor();
  await shot("p2-04-evidence");
  ok("evidence recorded as labelled demo preview; bad file type rejected");

  // Step 4 review + submit
  await p.getByRole("button", { name: "Lanjut" }).click();
  await p.getByText("isian belum lengkap").first().waitFor();
  await p.getByRole("button", { name: "Jumlah limbah" }).waitFor();
  await p.getByText("Perusahaan Mitra A", { exact: true }).waitFor();
  await shot("p2-05-review");
  await p.getByRole("button", { name: "Kirim Laporan" }).click();
  await p.getByRole("heading", { name: "Laporan terkirim" }).waitFor();
  await p.getByText("Menunggu Verifikasi").first().waitFor();
  ok("report submitted with missing waste listed, status Menunggu Verifikasi");

  // Real-time on company side (no reload)
  await c.getByText("Laporan diterima (real-time): 1").waitFor({ timeout: 10000 });
  await c.getByText("SUP-102 · Maret 2027").waitFor();
  await c.getByText("Menunggu Verifikasi").waitFor();
  if (shots) await c.screenshot({ path: `${shots}/p2-06-company-live.png` });
  ok("company dashboard received the report in real time");

  // Detail + history
  await p.getByRole("link", { name: "Lihat status laporan" }).click();
  await p.getByText("Laporan dikirim (v1)").waitFor();
  await p.getByText("Demo · tidak tersimpan").waitFor();
  await p.goto(BASE + "/s/laporan");
  await p.getByText("Laporan Maret 2027").waitFor();
  ok("detail timeline and reporting history show the submission");

  // Duplicate prevention
  await p.goto(BASE + "/s/laporan/baru?period=2027-03");
  await p.getByRole("button", { name: "Buka laporan Maret 2027" }).waitFor();
  await p.goto(BASE + "/s/laporan/2027-03/isi");
  await p.waitForURL("**/s/laporan/2027-03");
  ok("same month cannot be started again; submitted report is not editable");

  // Correction + resubmission
  await p.getByRole("button", { name: "Ajukan koreksi" }).click();
  await p.getByLabel("Apa yang perlu dikoreksi?").fill("Jumlah limbah lupa diisi");
  await p.getByRole("button", { name: "Ajukan" }).click();
  await p.waitForURL("**/s/laporan/2027-03/isi");
  await c.getByText("Perlu Perbaikan").waitFor({ timeout: 10000 });
  ok("correction request reopens the report; company sees Perlu Perbaikan live");
  await p.getByRole("button", { name: "Jumlah limbah" }).click();
  await p.getByLabel("Jumlah limbah").fill("22,2");
  await p.getByText("Draf tersimpan").waitFor({ timeout: 10000 });
  await p.getByRole("button", { name: "Lanjut" }).click();
  await p.getByRole("button", { name: "Lanjut" }).click();
  await p.getByText("Semua pertanyaan sudah dijawab.").waitFor();
  await p.getByRole("button", { name: "Kirim Ulang" }).click();
  await p.getByRole("heading", { name: "Laporan terkirim" }).waitFor();
  await p.getByRole("link", { name: "Lihat status laporan" }).click();
  await p.getByText("Laporan dikirim ulang (v2)").waitFor();
  await p.getByText("Anda mengajukan koreksi").waitFor();
  await c.getByText("Menunggu Verifikasi").waitFor({ timeout: 10000 });
  ok("resubmitted as v2 with full status history");

  // Consent revoke / restore propagates live
  await p.goto(BASE + "/s/perusahaan");
  await p.getByRole("switch", { name: /Perusahaan Mitra A/ }).click();
  await c.getByText("Laporan diterima (real-time): 0").waitFor({ timeout: 10000 });
  await p.getByRole("switch", { name: /Perusahaan Mitra A/ }).click();
  await c.getByText("Laporan diterima (real-time): 1").waitFor({ timeout: 10000 });
  ok("revoking and restoring consent updates the company view in real time");

  await p.goto(BASE + "/s");
  await p.getByText("Lihat Laporan").waitFor();
  await shot("p2-07-home-after");
  await browser.close();
  console.log("ALL PHASE 2 E2E CHECKS PASSED");
})().catch(async (e) => {
  if (shots && globalThis.__page) await globalThis.__page.screenshot({ path: `${shots}/fail2.png`, fullPage: true }).catch(() => {});
  console.error("FAIL", e.message.split("\n").slice(0, 6).join(" | "));
  process.exit(1);
});
