# Audit Model dan System Prompt

**Tanggal audit:** 2026-10-13  
**Ruang lingkup:** model selection, provider mapping, model picker, system prompt resolution, custom prompt files, dan lokasi penyimpanan prompt.  
**Status:** Review saja; audit ini tidak mengubah implementasi runtime.

## Ringkasan eksekutif

Implementasi model dan system prompt sudah memiliki arah desain yang benar, khususnya pemisahan antara:

- model yang digunakan untuk API request; dan
- model asal yang digunakan untuk memilih custom system prompt.

Namun, implementasi belum sepenuhnya konsisten. Risiko terbesar berada pada sinkronisasi metadata model, ketersediaan model di model picker, pemetaan model routed ke prompt yang tepat, serta lokasi file prompt internal.

Prioritas perbaikan yang disarankan:

1. Perbaiki resolver path prompt internal agar tidak bergantung pada current working directory.
2. Tambahkan `sonnet55` ke seluruh catalog model yang memang seharusnya menampilkannya.
3. Satukan metadata model, provider ID, display name, pricing, knowledge cutoff, dan prompt file dalam satu source of truth.
4. Pastikan model internal/routed tetap membawa identitas model asal saat memilih system prompt.
5. Gunakan local Claude directory dengan strategi local-first dan repository fallback.

## Temuan audit

### 1. Path `internal-subscriber.txt` bergantung pada current working directory

**Lokasi:** `src/utils/systemPrompt.ts`

Saat ini prompt internal dibaca menggunakan path relatif:

```ts
readFileSync('system/internal-subscriber.txt', 'utf8')
```

Path tersebut relatif terhadap current working directory process, bukan terhadap lokasi instalasi Claude atau repository. Jika CLI dijalankan dari directory lain, prompt dapat gagal dimuat. Kegagalan tersebut ditelan oleh `catch` dan dikembalikan sebagai `null`, sehingga masalah tidak terlihat.

**Dampak:**

- internal organization context dapat hilang tanpa pemberitahuan;
- perilaku berbeda antara interactive session, CI, IDE, dan headless execution;
- debugging menjadi sulit karena tidak ada diagnostic yang jelas.

**Saran:** gunakan resolver directory Claude yang konsisten dan tambahkan diagnostic debug ketika file tidak tersedia. Jangan menggunakan path relatif mentah.

### 2. `sonnet55` menjadi default tetapi tidak tersedia lengkap di model picker

**Lokasi:** `src/utils/model/configs.ts`, `src/utils/model/model.ts`, `src/utils/model/modelOptions.ts`

`sonnet55` sudah terdaftar di `ALL_MODEL_CONFIGS` dan digunakan oleh `getDefaultSonnetModel()`. Namun daftar `getAllPlanClaudeModelOptions()` tidak menampilkan opsi Sonnet 5.5.

**Dampak:**

- default dapat menggunakan Sonnet 5.5;
- user tidak dapat memilih Sonnet 5.5 secara eksplisit melalui model picker;
- catalog internal dan catalog Claude plan dapat tidak mencerminkan model yang tersedia;
- informasi model yang ditampilkan UI tidak sesuai dengan model default runtime.

**Saran:** pastikan setiap model yang dapat menjadi default dan diizinkan untuk tier tertentu memiliki entry picker yang sesuai, atau dokumentasikan secara eksplisit jika model tersebut memang sengaja tidak selectable.

### 3. Ketersediaan provider dan billing belum konsisten

Model baru seperti `haiku55`, `sonnet55`, `opus55`, dan `fable51` ditampilkan melalui model picker dengan provider-specific IDs. Namun belum terlihat validasi availability per provider yang sebanding dengan model picker.

Selain itu, pricing tidak konsisten:

- sebagian opsi menampilkan pricing;
- sebagian opsi tidak menampilkan pricing pada PAYG 1P;
- model 3P tidak menampilkan pricing, tetapi belum ada penjelasan availability atau billing dari provider.

**Dampak:**

- model dapat muncul tetapi gagal saat request;
- user dapat salah memahami biaya;
- model picker dan provider capability dapat berbeda.

**Saran:** pisahkan metadata `available`, `pricing`, dan `displayable` per provider/tier. Jangan menampilkan model hanya karena ID-nya ada di konfigurasi.

### 4. Model API dan model system prompt memiliki dua jalur resolusi

**Lokasi:** `src/QueryEngine.ts`, `src/constants/prompts.ts`, `src/utils/systemPrompt.ts`

Pemisahan model API dan model prompt adalah keputusan yang benar. `QueryEngine` sudah mencoba menyimpan `systemPromptModel` sebelum internal routing.

Namun, beberapa jalur lain memanggil `getSystemPrompt()` dengan `mainLoopModel` yang mungkin sudah berupa model routed seperti `combo/byv-flash-2410`. Jika model asal tidak lagi tersedia, resolver dapat kehilangan identitas model untuk memilih custom prompt, marketing name, dan knowledge cutoff.

**Dampak:**

- custom prompt spesifik model tidak ditemukan;
- knowledge cutoff dapat hilang;
- environment prompt hanya menampilkan model generic;
- internal Mythos context dapat tidak terpasang setelah routing.

**Saran:** simpan original model selection sebagai bagian dari session/query context, bukan hanya mengandalkan model runtime. Semua jalur pembentukan system prompt harus memakai nilai original tersebut.

### 5. Fallback `getSystemPromptModel()` untuk routed model belum eksplisit

**Lokasi:** `src/utils/model/model.ts`

Untuk input yang tidak cocok dengan config atau alias, resolver menggunakan canonical name dari input. Untuk model routed internal, hasilnya dapat tetap berupa `combo/byv-flash-2410`.

**Saran:** tambahkan kontrak yang jelas:

- model alias harus di-resolve ke canonical model;
- provider-specific ID harus di-resolve ke canonical model;
- internal routed ID harus dipasangkan dengan original model metadata;
- jika original metadata tidak tersedia, gunakan fallback system prompt yang aman dan observable.

### 6. Metadata model tersebar di banyak source

Informasi model saat ini tersebar di beberapa lokasi:

- `ALL_MODEL_CONFIGS`;
- default model resolver;
- alias list;
- model picker;
- display name dan marketing name;
- pricing;
- knowledge cutoff;
- custom prompt suffix map;
- environment prompt text;
- prompt files di folder `system/`.

**Dampak:** penambahan model baru dapat hanya lengkap di sebagian jalur. Contohnya, model dapat menjadi default tetapi belum tersedia di picker atau belum memiliki prompt mapping.

**Saran:** gunakan satu metadata model terstruktur yang menjadi source of truth untuk:

- canonical model ID;
- alias dan family;
- provider-specific ID;
- display name;
- pricing tier;
- knowledge cutoff;
- prompt filename;
- access policy;
- dukungan context window.

Dari metadata tersebut, model config, picker, system prompt resolver, dan environment prompt sebaiknya diturunkan atau divalidasi melalui test.

### 7. Knowledge cutoff belum memiliki validasi metadata yang kuat

Beberapa model Claude 5.x menggunakan cutoff yang sama, yaitu `July 2026`. Hal ini dapat benar, tetapi saat ini nilai cutoff masih ditentukan melalui conditional string matching.

**Saran:** simpan cutoff sebagai metadata per model dan tambahkan test agar setiap model yang diketahui memiliki nilai cutoff yang diharapkan. Hindari ketergantungan pada urutan `if` dan substring jika model bertambah.

### 8. Mapping legacy prompt membutuhkan regression test

Perubahan canonicalization sudah lebih konsisten untuk model seperti:

- `claude-3-5-sonnet`;
- `claude-3-7-sonnet`;
- `claude-3-haiku`;
- `claude-3-opus`.

Namun mapping manual antara canonical name dan prompt file tetap rentan terhadap typo atau model baru yang belum memiliki file.

**Saran:** buat test yang memeriksa seluruh `CANONICAL_MODEL_IDS` dan memastikan:

- canonical name dapat ditentukan;
- prompt filename yang diwajibkan tersedia;
- model yang memang tidak memiliki custom prompt dinyatakan secara eksplisit.

### 9. Policy internal subscriber belum sepenuhnya konsisten dengan UI

`system/internal-subscriber.txt` menyatakan agar subscription type atau plan details tidak ditampilkan. Namun model picker dan fungsi terkait masih memiliki deskripsi pricing, billing, dan subscription.

**Saran:** tentukan boundary policy dengan jelas:

- system prompt hanya mengatur respons model; atau
- UI dan system prompt sama-sama wajib menyembunyikan billing information.

Jika aturan berlaku untuk seluruh pengalaman internal subscriber, implementasikan juga pada UI metadata, bukan hanya prompt.

## Lokasi prompt: repository versus local Claude directory

Prompt dapat dipindahkan ke local Claude path, misalnya:

```text
C:\Users\<user>\.claude\system\claude-sonnet-5.5.txt
C:\Users\<user>\.claude\system\internal-subscriber.txt
```

Namun memindahkan seluruh prompt menjadi local-only memiliki trade-off.

### Keuntungan local Claude directory

- prompt dapat diubah tanpa rebuild repository;
- prompt internal tidak perlu berada di repository public;
- konfigurasi dapat berbeda per user atau environment;
- cocok untuk prompt organisasi dan prompt eksperimental.

### Risiko local-only

- instalasi baru dapat tidak memiliki prompt;
- CI, Docker, remote session, atau user dengan home directory berbeda dapat berperilaku berbeda;
- perubahan prompt tidak versioned di Git;
- isi prompt menjadi runtime-controlled dan dapat dimodifikasi oleh user, plugin, atau proses lain;
- reproduksi bug menjadi lebih sulit.

### Rekomendasi path

Gunakan strategi **local-first dengan repository fallback**:

```text
1. <Claude local dir>/system/<model>.txt
2. <repository atau bundled dir>/system/<model>.txt
3. default prompt tanpa custom file
```

Dengan strategi ini, local prompt dapat menjadi override, tetapi instalasi baru masih memiliki baseline yang reproducible.

Resolver sebaiknya menggunakan abstraction directory Claude yang sudah ada. Jangan hardcode path Windows dan jangan mengandalkan current working directory.

Contoh perilaku resolver yang disarankan:

```ts
for (const filePath of localFirstPromptPaths) {
  try {
    const content = readFileSync(filePath, 'utf8').trim()
    if (content) return content
  } catch {
    // Lanjutkan ke fallback berikutnya.
  }
}

return null
```

Untuk `internal-subscriber.txt`, local-only dapat dipertimbangkan jika prompt tersebut memang khusus internal. Walaupun demikian, tetap perlu fallback aman dan diagnostic debug ketika file tidak ditemukan.

## Rekomendasi ekstensi file

Gunakan **`.txt`** untuk system prompt runtime.

Alasannya:

- loader saat ini membaca suffix `.txt`;
- system prompt adalah plain text, bukan dokumen yang perlu dirender;
- `.txt` lebih jelas sebagai runtime asset;
- tidak menimbulkan asumsi bahwa Markdown perlu diparse atau diproses;
- lebih mudah diperlakukan konsisten oleh loader.

Gunakan `.md` untuk dokumentasi, catatan desain, atau prompt yang memang juga dimaksudkan sebagai dokumen manusia.

Rekomendasi struktur:

```text
<Claude local dir>/.claude/system/
├── claude-opus-5.5.txt
├── claude-sonnet-5.5.txt
├── claude-haiku-5.5.txt
└── internal-subscriber.txt
```

Ekstensi file sendiri tidak mengubah perilaku model. Yang penting adalah kontrak resolver dan format path yang digunakan aplikasi.

## Prioritas perbaikan

### Prioritas P0

1. Pastikan internal prompt tidak bergantung pada current working directory.
2. Pastikan routed model tidak kehilangan original model identity sebelum system prompt dibangun.
3. Validasi bahwa model default selalu memiliki prompt mapping atau fallback yang disengaja.

### Prioritas P1

1. Tambahkan `sonnet55` ke catalog picker yang relevan.
2. Buat resolver local-first dengan repository fallback.
3. Satukan resolver custom prompt dan internal subscriber prompt agar menggunakan path abstraction yang sama.
4. Selaraskan access policy, provider availability, dan billing display.

### Prioritas P2

1. Konsolidasikan metadata model.
2. Tambahkan regression test untuk canonicalization dan prompt files.
3. Pindahkan knowledge cutoff dan display metadata ke model metadata.
4. Dokumentasikan policy khusus internal subscriber.

## Kesimpulan

Fitur model dan system prompt belum sepenuhnya sinkron, walaupun fondasi pemisahan model runtime dan model prompt sudah tepat.

Desain penyimpanan yang direkomendasikan adalah:

- gunakan `.txt` untuk prompt runtime;
- simpan override di local Claude directory;
- gunakan repository atau bundled prompt sebagai fallback;
- gunakan resolver path terpusat;
- pertahankan original model identity untuk system prompt;
- validasi model picker, provider mapping, pricing, cutoff, dan prompt file dari metadata yang sama.

Audit ini bersifat review dan tidak melakukan perubahan terhadap implementasi runtime.
