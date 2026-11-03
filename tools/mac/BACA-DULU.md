# PJS #13 Spicy Lyrics di MacBook

Isi folder ini:

- `spicy-lyrics.js`: hasil build lengkap (tema Halloween + header GIK/PJS, semua gambar sudah di dalamnya). Sama persis dengan yang terpasang di laptop Windows.
- `install-mac.sh`: skrip pemasang untuk macOS.
- `hooks.patch`: perubahan kode di repo Spicy Lyrics (hanya kalau mau build ulang sendiri, lihat bagian bawah).

## Cara cepat (cukup pakai, tanpa build)

1. Pasang **Spotify desktop** dari spotify.com, buka sekali, login, lalu tutup.
2. Salin folder ini ke MacBook (AirDrop, flashdisk, Google Drive, apa saja).
3. Buka **Terminal**, masuk ke folder ini, lalu jalankan:

   ```sh
   cd ~/Downloads/pjs13-spicy-lyrics-mac   # sesuaikan lokasinya
   sh install-mac.sh
   ```

   Skrip ini memasang Spicetify kalau belum ada, menyalin `spicy-lyrics.js`, mengaktifkannya, lalu menjalankan `spicetify apply`.
4. Spotify terbuka ulang. Buka Spicy Lyrics, lalu Cinema View / Fullscreen.

Kalau lebih suka manual:

```sh
curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh
spicetify config spotify_path "/Applications/Spotify.app/Contents/Resources"
cp spicy-lyrics.js ~/.config/spicetify/Extensions/
spicetify config extensions spicy-lyrics.js
spicetify backup apply
```

## Penting

- **Jangan pasang Spicy Lyrics dari Marketplace** di Mac itu. Dua salinan saling bentrok (masalah yang sama dengan yang dulu terjadi di Windows). Kalau sudah terpasang, hapus dulu dari Marketplace.
- **Jangan klik tombol "Update"** di dalam Spicy Lyrics. Itu mengganti build ini dengan versi resmi tanpa tema.
- **Setelah Spotify update sendiri**, tema bisa hilang. Jalankan lagi: `spicetify backup apply`.
- macOS kadang meminta izin untuk Terminal. Kalau `spicetify apply` gagal karena izin, buka System Settings > Privacy & Security > App Management (atau Full Disk Access) dan izinkan Terminal.

## Kalau mau mengubah tema dari MacBook (opsional)

Butuh `git`, `bun`, dan `python3` (dengan Pillow untuk generator gambar).

1. Ambil repo yang sama: `git clone https://github.com/Spikerko/spicy-lyrics` lalu `git checkout 34ad8c6`.
2. Salin dari laptop Windows ke repo itu:
   - `src/components/Utils/` : `BrandedHeader.ts`, `BrandedHeaderAssets.ts`, `HalloweenTheme.ts`, `HalloweenAssets.ts`
   - `src/css/` : `BrandedHeader.css`, `HalloweenTheme.css`
   - folder `tools/branded-header/` dan `tools/halloween-theme/`
3. Pasang kaitannya: `python3 tools/branded-header/integrate.py` (atau `git apply hooks.patch`).
4. Build dan pasang: `bun install && bun run build`, lalu `cp dist/spicy-lyrics.js ~/.config/spicetify/Extensions/ && spicetify apply`.

Catatan:
- Untuk mengubah CSS atau posisi saja, generator gambar tidak perlu dijalankan: `HalloweenAssets.ts` sudah berisi semua gambar.
- `tools/halloween-theme/gen_assets.py` hanya perlu kalau mau mengganti atau menambah gambar. Skrip ini masih menunjuk ke folder aset Windows (`D:\GIK-INTERN\...`) dan berhenti kalau folder itu tidak ada. Di Mac, ubah variabel `LIB` di baris atas skrip ke lokasi folder `pjs13/pustaka` di Mac.
- Skrip uji live (`cdp.py` dkk.) dibuat untuk Windows dan belum diuji di Mac.
