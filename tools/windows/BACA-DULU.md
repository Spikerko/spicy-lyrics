# PJS #13 Spicy Lyrics di Windows lain

Isi folder ini:

- `spicy-lyrics.js`: hasil build lengkap (tema Halloween + header GIK/PJS, semua gambar sudah di dalamnya). Sama persis dengan yang terpasang di laptop utama.
- `install-windows.cmd`: klik dua kali untuk memasang.
- `install-windows.ps1`: skrip yang dijalankan oleh file `.cmd` di atas.

## Cara pasang

1. Pasang **Spotify desktop** dari https://www.spotify.com/download/windows/ (jangan versi Microsoft Store), buka sekali, login, lalu tutup.
2. Salin folder ini ke laptop Windows lain lalu ekstrak (kalau dalam bentuk zip).
3. Klik dua kali **`install-windows.cmd`**.
   - Spicetify akan dipasang otomatis kalau belum ada. Kalau ditanya mau pasang Marketplace, jawab `N`.
   - Kalau Windows SmartScreen muncul, klik "More info" lalu "Run anyway".
4. Spotify terbuka ulang. Putar lagu, buka Spicy Lyrics, lalu Cinema View / Fullscreen.

Kalau lebih suka manual (PowerShell):

```powershell
iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex
Copy-Item spicy-lyrics.js "$env:APPDATA\spicetify\Extensions\"
spicetify config extensions spicy-lyrics.js
spicetify backup apply
```

## Penting

- **Jangan pasang Spicy Lyrics dari Marketplace.** Dua salinan saling bentrok. Kalau sudah terpasang, hapus dulu dari Marketplace.
- **Jangan klik tombol "Update"** di dalam Spicy Lyrics. Itu mengganti build ini dengan versi resmi tanpa tema.
- **Setelah Spotify update sendiri**, tema bisa hilang. Klik dua kali `install-windows.cmd` lagi, atau jalankan `spicetify backup apply`.
- **Jangan jalankan sebagai Administrator.** Spicetify menolak berjalan dengan hak admin.

## Kalau gagal

Jalankan di PowerShell lalu kirim hasilnya:

```powershell
spicetify -v
Get-ChildItem "$env:APPDATA\spicetify\Extensions"
spicetify config extensions
```
