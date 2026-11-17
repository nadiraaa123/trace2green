import { PageHeader } from "@/components/supplier/ui";

const FAQ = [
  ["Data apa yang perlu disiapkan?", "Tagihan atau riwayat token listrik bulan lalu, catatan pembelian BBM/LPG, perkiraan berat kemasan dan limbah, jumlah produksi, serta perkiraan jarak pengiriman."],
  ["Bagaimana jika saya belum tahu angkanya?", "Kosongkan saja. Isian kosong dicatat sebagai belum diisi, tidak dianggap nol. Anda bisa melengkapinya nanti selama laporan masih berupa draf."],
  ["Kapan memilih “tidak memakai”?", "Bila usaha Anda memang tidak memakai kategori itu, misalnya tidak memakai BBM sama sekali. Ini berbeda dengan belum tahu angkanya."],
  ["Format angka", "Gunakan titik untuk ribuan dan koma untuk desimal, misalnya 1.250 atau 28,9. Aplikasi menampilkan bagaimana angka Anda terbaca."],
  ["Apakah foto bukti saya disimpan?", "Pada versi demo ini belum. File hanya ditampilkan di perangkat Anda; yang tercatat hanya nama, jenis, dan ukuran file."],
  ["Siapa yang bisa melihat laporan saya?", "Hanya perusahaan pembeli yang Anda izinkan di menu Perusahaan Terhubung, dan hanya laporan yang sudah dikirim. Draf tidak pernah dibagikan."],
  ["Saya salah mengisi laporan yang sudah dikirim", "Buka laporan tersebut dan pilih “Ajukan koreksi” selama belum diverifikasi. Versi sebelumnya tetap tersimpan sebagai riwayat."],
  ["Apakah skor ini sertifikat emisi resmi?", "Bukan. Skor dan estimasi emisi adalah alat bantu pemantauan, bukan sertifikasi akuntansi karbon atau jaminan kepatuhan PSPK."],
];

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Bantuan" />
      <div className="space-y-2.5">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group rounded-2xl border border-line bg-white p-4 open:shadow-[var(--shadow-card)]">
            <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">{q}</summary>
            <p className="mt-2 text-sm leading-relaxed text-navy-700">{a}</p>
          </details>
        ))}
      </div>
    </>
  );
}
