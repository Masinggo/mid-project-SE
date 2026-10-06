# Pemantau Gizi

Aplikasi Expo/React Native untuk mencatat makanan dan asupan gizi harian. Web dapat di-host di Vercel; autentikasi dan data menggunakan Firebase Authentication dan Cloud Firestore. Tidak diperlukan server Railway untuk alur saat ini.

## Menjalankan lokal

```bash
npm install
npx expo start
```

Untuk membuat build web statis:

```bash
npx expo export --platform web
```

Hasil ekspor dibuat di `dist/`.

## Hosting web di Vercel

Hubungkan repository GitHub ke Vercel, lalu gunakan:

- Framework preset: `Other`
- Root directory: `./`
- Install command: `npm install`
- Build command: `npx expo export --platform web`
- Output directory: `dist`

Setelah deployment, tambahkan hostname Vercel ke Firebase Authentication → Settings → Authorized domains. Frontend memakai konfigurasi Firebase dari `src/app/firebaseConfig.js`; jangan pernah memasukkan service-account key ke build frontend.

## Firestore dan model data

- `makanan_tkpi`: katalog yang dibaca pengguna login. Nutrisi disimpan per `servingAmount` dan `servingUnit` (`g`, `ml`, `butir`, atau `porsi`).
- `users/{uid}/meal_logs`: catatan pribadi, dengan waktu, jumlah, unit, dan snapshot nilai gizi dasar untuk perhitungan/edit.
- `food_submissions/{recipeId}`: pengajuan resep bersama yang menunggu tinjauan admin. Resep baru tidak otomatis masuk katalog publik.
- `users/{uid}`: profil pengguna, termasuk tanggal lahir, jenis kelamin biologis, berat, tinggi, tingkat aktivitas, dan target kalori.

Untuk data katalog lama, bila dokumen belum punya `servingAmount`/`servingUnit`, aplikasi mencoba membaca takaran dari nama seperti `(100 g)` atau `(100 ml)`. Selain itu data ditandai sebagai `1 porsi (satuan belum ditetapkan)`. Sebelum mengandalkan hitungannya, lengkapi data lama di Firestore dengan satuan yang benar dan pastikan nilai nutrisi sesuai takaran tersebut.

## Aturan keamanan Firestore

`firestore.rules` adalah contoh aturan untuk skema aplikasi ini. Tinjau dan sesuaikan dengan aturan yang sudah digunakan project Firebase sebelum menerapkannya. Jangan mengganti aturan project secara membabi buta karena bisa memutus akses fitur lain.

Aturan membatasi katalog makanan bersama agar hanya pengguna login yang dapat membacanya. Katalog dapat ditulis oleh akun dengan Firebase custom claim `admin: true` saja. Profil dan log makan dapat dibaca pemilik atau admin; hanya pemilik yang dapat menulis profil/log. Pengguna dapat mengelola pengajuan miliknya yang belum disetujui, sedangkan admin dapat membaca seluruh pengajuan serta menyetujui atau menolaknya.

### Panel admin dan provisioning akun

Panel admin tersedia sebagai tab **Admin** setelah login dengan akun yang memiliki custom claim `admin: true`. Panel menampilkan semua profil, catatan makan pengguna, dan permohonan resep. Persetujuan akan memublikasikan dokumen katalog secara atomik; revisi memperbarui dokumen katalog asal dan mempertahankan pemilik aslinya. Penolakan mewajibkan alasan agar pemohon dapat memperbaiki pengajuan.

Untuk memberikan role admin kepada email tertentu, jalankan dari PowerShell di folder project:

```powershell
$env:ADMIN_EMAIL = "admin@example.com"
node .\scripts\provision-admin.js
```

Script memakai `serviceAccountKey.json` lokal yang memiliki hak Firebase Admin. Jika email belum memiliki akun Firebase Auth, script membuat akun dengan password sementara acak dan menampilkannya sekali. Jika akun sudah ada, script hanya menambahkan custom claim dan tidak mengubah password. Setelah role ditambahkan, keluar lalu masuk kembali agar token diperbarui. Jangan mengunggah service-account key atau password ke GitHub, Vercel, atau frontend.

Terapkan aturan sebelum memakai panel admin di production:

```bash
firebase deploy --only firestore:rules
```

Pastikan konfigurasi Firebase CLI menunjuk ke project yang benar. Firebase Console juga tetap dapat digunakan sebagai jalur pemulihan manual.

## Mengisi data makanan

Data awal dapat dimasukkan lewat Firebase Console atau script seed lokal `seedMakanan.js`. Script itu memakai `serviceAccountKey.json`; file tersebut sudah diabaikan Git dan tidak boleh diunggah ke GitHub/Vercel. Script seed dapat dijalankan ulang: ia hanya menambahkan makanan yang namanya belum ada dan melewati dokumen lama tanpa mengubahnya. Daftar seed mencakup 31 makanan awal dan 15 tambahan (masing-masing 5 lauk, camilan, dan minuman). Takaran tempe goreng dan tahu goreng ditetapkan 50 g; hidangan campuran menggunakan porsi contoh dan bisa berbeda cukup besar menurut resep. Katalog juga menyediakan `air putih` sebanyak 250 ml dengan 0 kcal, 0 g protein, 0 g lemak, dan 0 g karbohidrat. Ini berlaku untuk air biasa tanpa pemanis atau bahan tambahan.

Saat menambah makanan dasar di Firestore, gunakan field:

| Field | Tipe | Contoh |
|---|---|---|
| `name` | string | `Telur rebus` |
| `calories` | number | `77` |
| `protein` | number | `6` |
| `fat` | number | `5` |
| `carbs` | number | `1` |
| `servingAmount` | number | `1` |
| `servingUnit` | string | `butir` |
| `servingLabel` | string | `1 butir (50 g)` |
| `category` | string | `lauk` |
| `nutritionSource` | string | `Estimasi nilai acuan umum` |
| `nutritionNote` | string | `Perkiraan; nilai aktual bergantung bahan dan cara memasak.` |

Nilai dalam seed adalah estimasi acuan per takaran yang dicantumkan, bukan hasil analisis laboratorium atau angka yang dijamin tepat untuk semua resep. Makanan kemasan dan hidangan campuran sangat bergantung pada merek, bahan, minyak, resep, dan ukuran porsi. Untuk nilai yang lebih spesifik, cocokkan bahan dengan [USDA FoodData Central](https://fdc.nal.usda.gov/) atau tabel komposisi pangan yang sesuai; sertakan sumber dan takaran yang benar di katalog. Resep buatan pengguna dihitung dari nilai katalog yang dipilih dan juga ditandai sebagai estimasi.

## Estimasi kebutuhan energi dan makronutrien

Pengguna dewasa (18+) dapat menyimpan tanggal lahir, jenis kelamin biologis yang dipakai rumus, berat, tinggi, dan tingkat aktivitas pada Profil. Untuk akun lama, lengkapi profil tersebut di tab Profil. Aplikasi memakai persamaan Mifflin–St Jeor untuk memperkirakan energi istirahat lalu mengalikannya dengan faktor aktivitas umum; hasilnya ditampilkan sebagai estimasi pemeliharaan berat, bukan batas maksimum atau rekomendasi untuk menurunkan/menaikkan berat.

Rentang makro memakai rentang AMDR dewasa: protein 10–35%, lemak 20–35%, dan karbohidrat 45–65% dari estimasi energi. Batas bawah protein juga tidak ditampilkan lebih rendah dari 0,8 g/kg berat badan. Pembandingan asupan harian menggunakan angka makanan di katalog, sehingga ketidakpastian data makanan juga memengaruhi hasil. Target kalori yang dapat diedit di Profil tetap tersedia sebagai pilihan pribadi; angka tersebut terpisah dari estimasi pemeliharaan yang ditampilkan pada kartu rekomendasi.

Angka ini hanya panduan umum untuk dewasa non-hamil, bukan saran medis atau diagnosis. Rumus energi dan faktor aktivitas adalah pendekatan populasi; kebutuhan seseorang dapat berbeda. BMI hanya alat skrining. Kehamilan/menyusui, usia di bawah 18 tahun, penyakit, obat, tujuan perubahan berat, atau kebutuhan klinis memerlukan penilaian tenaga kesehatan.

Referensi:

- [USDA DRI Calculator for Healthcare Professionals](https://www.nal.usda.gov/human-nutrition-and-food-safety/dri-calculator): menjelaskan estimasi energi dan rekomendasi DRI dari tinggi, berat, usia, serta aktivitas, dan mencatat bahwa kebutuhan individu dapat berbeda.
- [Mifflin et al. (1990), A new predictive equation for resting energy expenditure](https://pubmed.ncbi.nlm.nih.gov/2305711/).
- [Dietary Reference Intakes for Macronutrients (National Academies)](https://www.ncbi.nlm.nih.gov/books/NBK56068/): landasan rentang distribusi makronutrien yang dapat diterima.
- [CDC: About BMI](https://www.cdc.gov/bmi/about/index.html): BMI adalah ukuran skrining dan tidak secara langsung mengukur lemak tubuh.

Untuk daftar kategori resep, gunakan `makanan_utama`, `lauk`, `camilan`, atau `minuman`.
