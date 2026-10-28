# Audit Fast Mode / Automode

**Tanggal audit:** 2026-10-13  
**Scope:** capability detection, provider gating, model switching, UI/UX, API payload, retry state, dan pricing fast mode.  
**Batasan:** audit dan dokumentasi saja. Tidak ada source code yang diubah.

## Ringkasan eksekutif

Implementasi saat ini **belum aman disebut sebagai fast mode untuk semua model**. Source mencampur dua semantics:

1. **Fast mode sebagai modifier** yang seharusnya mempertahankan model pilihan user; dan
2. **Fast mode sebagai routing ke model tertentu**, saat ini alias `opus` yang default-nya telah berubah ke Opus 5.5.

Capability check, UI, model switching, dan billing masih mengikuti asumsi lama bahwa fast mode adalah fitur Opus 4.6. Di saat yang sama, provider non-first-party dibuka secara umum tanpa capability matrix per provider.

### Prioritas perbaikan

| Prioritas | Temuan | Status |
|---|---|---|
| P0 | First-party hanya mengizinkan model yang memuat `opus-4-6` | Terkonfirmasi |
| P0 | Target model, label, dan pricing tidak konsisten | Terkonfirmasi |
| P0 | Pricing registry tidak sinkron dengan catalog model terbaru | Terkonfirmasi |
| P1 | Perpindahan model mematikan fast mode untuk hampir semua model first-party | Terkonfirmasi |
| P1 | Settings `/config` memiliki behavior berbeda dari `/fast` | Terkonfirmasi |
| P1 | Provider non-first-party dianggap supported secara blanket tanpa capability validation | Terkonfirmasi sebagai design risk |
| P1 | Label UI masih menyatakan Opus 4.6-only | Terkonfirmasi |
| P2 | Klaim bahwa provider non-first-party dapat memiliki `fastMode: true` tetapi capability check tetap `false` tidak sesuai source saat ini | Dikoreksi |

## Temuan terperinci

### 1. First-party belum mendukung semua model

**Severity: P0 — bug fungsional**  
**Status: Terkonfirmasi**  
**Lokasi:** `src/utils/fastMode.ts:167-183`

`isFastModeSupportedByModel()` hanya mengembalikan `true` untuk model yang setelah parsing mengandung `opus-4-6`. Model first-party lain jatuh ke `false` karena branch provider third-party tidak berlaku pada first-party.

Dampaknya mencakup model yang sudah tersedia di catalog/config, antara lain:

- Fable 5 dan Fable 5.1
- Mythos 5 dan Mythos 5.1
- Opus 3, 4.7, 4.8, 5, dan 5.5
- Sonnet 4.6, 5, dan 5.5
- Haiku 4.5 dan 5.5

Ini membuat requirement fast mode lintas model tidak terpenuhi pada first-party. Selain itu, default model Max/Team Premium sekarang adalah Opus 5.5 (`src/utils/model/model.ts:107-113` dan `src/utils/model/model.ts:198-205`), yang secara langsung tidak lolos capability check.

**Dampak sistemik:** state UI, model picker, initial setting, API payload, dan system initialization semuanya bergantung pada check ini; satu check yang terlalu sempit menyebarkan behavior lama ke banyak entry point.

### 2. `getFastModeModel()`, display label, default model, dan billing tidak konsisten

**Severity: P0 — bug correctness/billing**  
**Status: Terkonfirmasi**  
**Lokasi:**

- `src/utils/fastMode.ts:142-147`
- `src/utils/model/model.ts:107-113`
- `src/commands/fast/fast.tsx:63-64`
- `src/utils/model/modelCost.ts:102-109`

Saat ini:

- `FAST_MODE_MODEL_DISPLAY` menyatakan `Opus 4.6`;
- `getFastModeModel()` mengembalikan alias `opus`;
- alias `opus` diarahkan ke `getDefaultOpusModel()`;
- `getDefaultOpusModel()` mengarah ke `opus55` bila tidak ada override;
- UI dan pricing fast mode tetap menggunakan helper khusus Opus 4.6.

Dengan demikian, flow `/fast` dapat mengganti model ke alias yang resolve ke Opus 5.5, sementara pesan UI menyatakan Opus 4.6 dan biaya fast dihitung memakai tier fast Opus 4.6.

**Dampak:** model aktual, model yang diberitahukan ke user, dan basis billing dapat berbeda. Ini harus diputuskan melalui satu semantics eksplisit sebelum perubahan implementasi dilakukan.

### 3. Capability provider non-first-party terlalu optimistis

**Severity: P1 — compatibility/design risk**  
**Status: Terkonfirmasi sebagai design risk; incompatibility provider belum dapat dibuktikan dari source lokal**  
**Lokasi:**

- `src/utils/fastMode.ts:113-117`
- `src/utils/fastMode.ts:167-183`
- `src/utils/model/providers.ts:44-53`
- `src/services/api/claude.ts:1398-1403`
- `src/services/api/claude.ts:1646-1655`

`isThirdPartyAnthropicProvider()` bernilai `true` untuk seluruh provider selain `firstParty` (`bedrock`, `vertex`, `foundry`, `openai`) dan untuk custom `ANTHROPIC_BASE_URL` non-Anthropic. Fast mode availability melewati org-status restriction, sedangkan model capability langsung dianggap supported untuk semua model ketika provider tersebut third-party.

Akibatnya source tidak memiliki validasi bahwa tiap provider mendukung seluruh kontrak fast mode:

- field `speed: 'fast'`;
- `FAST_MODE_BETA_HEADER`;
- retry/cooldown behavior; dan
- semantics billing fast mode.

**Catatan koreksi terhadap review awal:** pada source saat ini, provider non-first-party **tidak** membuat `isFastModeSupportedByModel()` tetap `false`; fungsi tersebut mengembalikan `true` pada branch third-party. Karena itu, temuan “state `fastMode: true` tetapi capability check tetap false” tidak terkonfirmasi secara literal. Risiko yang benar adalah capability check terlalu luas dan tidak berbasis capability per provider.

### 4. `/fast` dan `/config` memiliki semantics model switching yang berbeda

**Severity: P1 — bug UX/state consistency**  
**Status: Terkonfirmasi**  
**Lokasi:**

- `/fast`: `src/commands/fast/fast.tsx:16-39`
- `/config`: `src/components/Settings/Config.tsx:345-377`

Flow `/fast` hanya mengganti model ketika model first-party saat ini dianggap tidak supported, dan tidak mengganti model pada provider non-first-party. Sebaliknya, Settings selalu mengatur:

```text
mainLoopModel: getFastModeModel()
mainLoopModelForSession: null
```

ketika fast mode diaktifkan.

Karena `getFastModeModel()` adalah alias `opus`, dua entry point dapat menghasilkan model aktif yang berbeda untuk user dengan state awal yang sama. Ini juga memperkuat mismatch Opus 4.6 versus Opus 5.5.

### 5. Model picker dan PromptInput mematikan fast mode saat model berubah

**Severity: P1 — bug fungsional/UX**  
**Status: Terkonfirmasi**  
**Lokasi:**

- `src/commands/model/model.tsx:61-79`
- `src/commands/model/model.tsx:197-226`
- `src/components/PromptInput/PromptInput.tsx:2022-2044`
- `src/components/ModelPicker.tsx:337-343`

Ketika `fastMode` aktif dan model baru tidak lolos `isFastModeSupportedByModel()`, beberapa entry point langsung mengatur `fastMode: false` dan menampilkan `Fast mode OFF`.

Dengan capability first-party yang hanya menerima Opus 4.6, memilih Fable, Haiku, Sonnet, atau Opus versi lain akan mematikan fast mode. Ini bertentangan dengan semantics fast mode sebagai modifier lintas model.

### 6. Label UI masih menyatakan “Opus 4.6 only”

**Severity: P1 — misleading UX**  
**Status: Terkonfirmasi**  
**Lokasi:**

- `src/commands/fast/index.ts:7-12`
- `src/commands/fast/fast.tsx:80-83`
- `src/commands/fast/fast.tsx:199-202`
- `src/commands/fast/fast.tsx:239-243`
- `src/components/ModelPicker.tsx:337-343`
- `src/components/Settings/Config.tsx:345-350`

Label dan notifikasi masih menyebut:

- `Fast mode (Opus 4.6 only)`;
- `High-speed mode for Opus 4.6`;
- `available with Opus 4.6 only`; dan
- model akan diset ke Opus 4.6.

Jika keputusan produk adalah fast mode sebagai modifier semua model, seluruh label ini menjadi salah. Jika keputusan produk adalah routing ke target tertentu, label tetap harus menyebut target aktual yang benar dan tidak boleh bergantung pada alias yang berubah.

### 7. API memang meneruskan `speed: 'fast'`, tetapi hanya setelah gating yang bermasalah

**Severity: P1 — dependency on incorrect capability contract**  
**Status: Terkonfirmasi**  
**Lokasi:**

- `src/services/api/claude.ts:1398-1403`
- `src/services/api/claude.ts:1642-1655`

Hal yang benar: API mengatur `speed = 'fast'` ketika semua syarat terpenuhi dan menambahkan beta header secara latch.

Namun syarat utamanya masih:

```text
isFastModeSupportedByModel(options.model)
```

Karena check tersebut hanya menerima Opus 4.6 pada first-party, request first-party untuk model lain berjalan tanpa `speed: 'fast'` walaupun state user meminta fast mode. Ini menjelaskan mengapa bug capability langsung terlihat sebagai bug API behavior.

### 8. Pricing fast mode di-hardcode ke tier Opus 4.6

**Severity: P0 — billing correctness**  
**Status: Terkonfirmasi**  
**Lokasi:**

- `src/commands/fast/fast.tsx:63-64`
- `src/commands/fast/fast.tsx:240-243`
- `src/utils/model/modelCost.ts:102-109`
- `src/utils/model/modelCost.ts:161-167`

UI `/fast` selalu memanggil `getOpus46CostTier(true)`. Di cost calculation, special-case fast hanya diterapkan saat canonical model sama dengan `claude-opus-4-6`.

Jika fast mode dipertahankan pada model lain, pricing tidak dapat tetap memakai helper Opus 4.6. Billing perlu menerima model aktual dan usage speed, lalu memilih tier berdasarkan kombinasi model/provider/speed yang benar.

### 9. Model catalog sudah memiliki banyak Claude 5, tetapi `MODEL_COSTS` belum sinkron

**Severity: P0 — billing/observability correctness**  
**Status: Terkonfirmasi**  
**Lokasi:**

- Catalog: `src/utils/model/configs.ts:28-116`, `src/utils/model/configs.ts:223-269`
- Pricing: `src/utils/modelCost.ts:114-140`
- Fallback: `src/utils/modelCost.ts:158-177`

**Koreksi terhadap review awal:** model-model tersebut sudah terdaftar di `ALL_MODEL_CONFIGS`; masalahnya adalah sebagian belum memiliki entry pricing.

`MODEL_COSTS` saat ini memiliki entry untuk Fable 5 dan Mythos 5, tetapi tidak terlihat entry untuk model berikut:

- Fable 5.1
- Mythos 5.1
- Opus 5
- Opus 5.5
- Opus 4.7
- Opus 4.8
- Opus 3
- Sonnet 5
- Sonnet 5.5
- Haiku 5.5

`firstPartyNameToCanonical()` sudah menghasilkan canonical name untuk sebagian besar model tersebut (`src/utils/model/model.ts:229-325`), sehingga lookup dapat gagal secara deterministik. Saat lookup gagal, kode mencatat `tengu_unknown_model_cost` lalu memakai cost default. Untuk default Opus 5.5, fallback berpotensi tetap gagal pada lookup model default dan berakhir pada `DEFAULT_UNKNOWN_MODEL_COST`.

**Dampak:** internal billing dapat memakai tarif yang salah dan observability akan menganggap model valid sebagai unknown model.

### 10. Klaim positif dari review sebelumnya yang terverifikasi

Bagian berikut sesuai dengan source yang diaudit:

- `speed: 'fast'` diteruskan ketika capability check terpenuhi (`src/services/api/claude.ts:1642-1655`);
- fast-mode beta header di-latch untuk menjaga stabilitas cache key (`src/services/api/claude.ts:1425-1429` dan `1642-1655`);
- cooldown dan runtime state tersedia (`src/utils/fastMode.ts:186-245`);
- API rejection dapat menonaktifkan fast mode (`src/utils/fastMode.ts:247-263`);
- retry context menyimpan dan dapat menonaktifkan fast mode (`src/services/api/withRetry.ts:183-312`);
- prompt caching dipisahkan dari `speed` melalui dynamic speed dan latched header.

Verifikasi ini tidak menghapus temuan di atas karena semua behavior tersebut tetap bergantung pada semantics model/provider yang belum konsisten.

## Keputusan desain yang wajib ditetapkan

Sebelum implementasi perbaikan, pilih salah satu kontrak berikut.

### Opsi A — Fast mode sebagai modifier model

- Model user dipertahankan saat fast mode diaktifkan.
- `getFastModeModel()` tidak menjadi bagian dari flow fast mode.
- Capability fast mode ditentukan oleh provider dan model secara eksplisit.
- Pricing memakai model aktual + `usage.speed`.
- Model picker tidak mematikan fast mode selama kombinasi provider/model memang supported.
- Label UI menyatakan “Fast mode” tanpa target Opus tertentu.

### Opsi B — Fast mode sebagai target model khusus

- Target model ditetapkan sebagai canonical model version yang tidak berubah diam-diam.
- Alias `opus` tidak boleh digunakan sebagai target karena default alias sudah berubah ke Opus 5.5.
- `FAST_MODE_MODEL_DISPLAY`, `getFastModeModel()`, API capability, pricing, model picker, dan Settings harus memakai target yang sama.
- Semua model lain harus menampilkan behavior switching yang konsisten di `/fast`, `/config`, model picker, dan PromptInput.

Berdasarkan temuan saat ini, **Opsi A paling sesuai dengan requirement “fast mode untuk semua model”**, tetapi keputusan produk/API tetap perlu menjadi sumber kebenaran sebelum perubahan kode.

## Rekomendasi tindak lanjut audit

1. Definisikan capability matrix terpusat untuk pasangan provider/model; jangan gunakan `isThirdPartyAnthropicProvider()` sebagai bukti capability.
2. Tetapkan satu semantics fast mode dan hapus auto-switch yang tidak sesuai semantics tersebut.
3. Ubah pricing lookup agar berbasis model aktual dan speed, bukan helper bernama Opus 4.6.
4. Tambahkan test comprehensiveness yang membandingkan `ALL_MODEL_CONFIGS` dengan `MODEL_COSTS`.
5. Tambahkan test state transition untuk `/fast`, `/config`, `/model`, ModelPicker, dan PromptInput dengan model default Opus 5.5 serta model non-Opus.
6. Tambahkan test provider matrix untuk first-party, Bedrock, Vertex, Foundry, OpenAI, dan custom `ANTHROPIC_BASE_URL`.
7. Verifikasi request body dan beta headers pada tiap provider sebelum fitur dibuka secara umum.
8. Setelah semantics ditetapkan, sinkronkan seluruh label, telemetry, initial setting, runtime state, retry, API request, dan billing.

## Rencana perbaikan berbasis task

Bagian ini menerjemahkan temuan audit menjadi task implementasi yang dapat dikerjakan secara berurutan. Rekomendasi menggunakan **Opsi A: fast mode sebagai modifier model**, karena requirement yang diaudit adalah fast mode untuk semua model.

> **Catatan test harness:** repository saat ini tidak memiliki `test` script di `package.json` dan tidak ditemukan test file melalui daftar file Git. Suite di bawah ini adalah target test yang perlu ditambahkan. Command standar yang direkomendasikan adalah `bun test <path>`; `bun run build` dan `git diff --check` tetap menjadi verification gate.

### Task FM-00 — Tetapkan kontrak fast mode dan capability matrix

**Prioritas:** P0  
**Dependensi:** none  
**Tujuan:** Menjadikan semantics fast mode dan dukungan provider/model sebagai satu sumber kebenaran.

**Perbaikan yang direkomendasikan:**

- Tetapkan fast mode sebagai modifier terhadap model aktif; mengaktifkan fast mode tidak mengubah `mainLoopModel`.
- Definisikan capability terpusat dengan input minimal `provider`, `model`, dan status fast-mode service.
- Bedakan tiga kondisi secara eksplisit: fitur tidak tersedia, kombinasi provider/model tidak supported, dan fitur tersedia tetapi sedang cooldown.
- Jangan memakai `isThirdPartyAnthropicProvider()` sebagai bukti capability. Provider third-party hanya menentukan routing, bukan dukungan `speed: 'fast'`.
- Tentukan policy fail-closed untuk provider yang belum diverifikasi.
- Dokumentasikan apakah `speed: 'fast'` berlaku untuk custom `ANTHROPIC_BASE_URL`; default yang aman adalah `false` sampai router menyatakan dukungan.

**Acceptance criteria:**

- Ada satu fungsi/policy yang dipakai oleh UI, state initialization, model switching, API request, retry, dan system init.
- Capability tidak lagi diambil dari string match `opus-4-6` atau blanket third-party branch.
- Provider yang belum memiliki kontrak fast mode tidak dapat mengaktifkan fast mode secara diam-diam.
- Semantics ini tercermin pada telemetry dan pesan unavailable.

**Suite test FM-00:**

- Unit: seluruh kombinasi provider (`firstParty`, `bedrock`, `vertex`, `foundry`, `openai`, custom base URL) dan capability yang diharapkan.
- Unit: model canonical, alias, suffix `[1m]`, tanggal model, dan model custom.
- Contract: provider unsupported tidak pernah menghasilkan `speed: 'fast'`.
- Regression: perubahan env provider tidak mengubah capability secara tidak terduga setelah state diinisialisasi.

### Task FM-01 — Perbaiki capability check lintas model first-party

**Prioritas:** P0  
**Dependensi:** FM-00  
**Tujuan:** Menghilangkan Opus 4.6-only restriction dan memastikan seluruh model yang memang didukung dapat memakai fast mode.

**Perbaikan yang direkomendasikan:**

- Ganti string match `opus-4-6` dengan lookup capability dari policy FM-00.
- Masukkan seluruh model yang didukung secara eksplisit: Fable, Mythos, Opus, Sonnet, dan Haiku sesuai kontrak API aktual.
- Pastikan alias (`opus`, `sonnet`, `haiku`, `fable`, `mythos`) di-resolve ke model canonical sebelum capability lookup.
- Pastikan model dengan `[1m]` tidak kehilangan capability karena suffix.
- Jangan menganggap model yang hanya ada di catalog otomatis supported sebelum API contract-nya diverifikasi.

**Acceptance criteria:**

- Model first-party yang terdaftar sebagai supported menghasilkan `true`.
- Model first-party yang belum diverifikasi menghasilkan `false` dengan alasan yang dapat ditampilkan.
- Capability konsisten untuk canonical ID, alias, dan provider-specific override.
- `getInitialFastModeSetting()`, `getFastModeState()`, API request, dan system init menghasilkan keputusan yang sama.

**Suite test FM-01:**

- Parameterized unit test untuk semua `ALL_MODEL_CONFIGS` yang ditetapkan supported.
- Unit test negatif untuk model unknown, model custom yang tidak diverifikasi, dan model OpenAI/Codex.
- Unit test alias-to-canonical untuk setiap family alias.
- Unit test `[1m]` pada Opus, Sonnet, Fable, dan Mythos.
- Regression test default Max/Team Premium yang resolve ke Opus 5.5.

### Task FM-02 — Hapus auto-switch model dan samakan semua entry point

**Prioritas:** P0  
**Dependensi:** FM-00, FM-01  
**Tujuan:** Memastikan `/fast`, `/config`, `/model`, ModelPicker, dan PromptInput memiliki behavior yang identik.

**Perbaikan yang direkomendasikan:**

- Hapus penggunaan `getFastModeModel()` dari flow aktivasi fast mode jika Opsi A dipilih.
- `/fast on` hanya mengubah fast-mode state/settings, tanpa mengganti `mainLoopModel`.
- `/config` menggunakan transition yang sama dengan `/fast`, bukan selalu mengatur model ke alias `opus`.
- Model picker dan PromptInput mempertahankan fast mode ketika model baru supported.
- Jika model baru unsupported, jangan mengaktifkan state palsu; tampilkan alasan dan pertahankan atau nonaktifkan state sesuai policy FM-00 secara atomik.
- Pastikan `mainLoopModelForSession` tidak dihapus sebagai side effect fast mode karena tidak ada perubahan model.

**Acceptance criteria:**

- Mengaktifkan fast mode dari setiap entry point mempertahankan model pilihan user.
- Memilih model supported saat fast mode aktif tidak menghasilkan `Fast mode OFF`.
- Memilih model unsupported tidak menghasilkan `fastMode: true` yang tidak dapat dikirim sebagai fast request.
- State settings, AppState, dan request context tetap sinkron.

**Suite test FM-02:**

- State transition test `/fast on|off` dengan model Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1, dan model unsupported.
- State transition test `/config` dengan kasus yang sama.
- Component/integration test ModelPicker dan PromptInput saat memilih model ketika fast mode aktif.
- Regression test bahwa `mainLoopModel`, `mainLoopModelForSession`, dan `fastMode` berubah hanya sesuai transition contract.
- Cross-entry-point equivalence test: input state yang sama harus menghasilkan output state yang sama dari `/fast` dan `/config`.

### Task FM-03 — Sinkronkan UI, label, notifikasi, dan telemetry

**Prioritas:** P1  
**Dependensi:** FM-00, FM-02  
**Tujuan:** Menghilangkan pesan Opus 4.6-only yang tidak lagi sesuai semantics modifier.

**Perbaikan yang direkomendasikan:**

- Ubah command description, dialog subtitle, ModelPicker notice, Settings label, dan shortcut notification menjadi label generik fast mode.
- Tampilkan nama model aktif bila informasi itu berguna, tetapi jangan menyatakan fast mode hanya untuk Opus 4.6.
- Pisahkan pesan “fast mode unavailable”, “model/provider unsupported”, dan “cooldown”.
- Perbarui event telemetry agar mencatat model dan provider aktual, bukan hanya status toggle.
- Pastikan pesan sukses tidak mengklaim model telah diubah jika model dipertahankan.

**Acceptance criteria:**

- Tidak ada user-facing label `Opus 4.6 only` pada flow fast mode modifier.
- Notifikasi `/fast`, `/config`, `/model`, dan PromptInput konsisten.
- Pesan unsupported menyebut kombinasi provider/model yang gagal bila aman untuk ditampilkan.
- Telemetry mencatat hasil transition yang benar.

**Suite test FM-03:**

- Snapshot/component test untuk dialog FastModePicker dalam state on, off, unavailable, dan cooldown.
- Component test ModelPicker notice saat fast mode aktif.
- Command output test untuk `/fast on`, `/fast off`, dan model switch.
- Telemetry assertion untuk source, provider, model, enabled state, dan unavailable reason.
- Static text regression check untuk memastikan label lama tidak tersisa.

### Task FM-04 — Rancang ulang pricing berdasarkan model aktual dan speed

**Prioritas:** P0  
**Dependensi:** FM-00, FM-01  
**Tujuan:** Menghapus hardcode tier Opus 4.6 dan mencegah billing salah ketika fast mode dipakai pada model lain.

**Perbaikan yang direkomendasikan:**

- Ganti `getOpus46CostTier(true)` dengan lookup berbasis `(canonicalModel, usage.speed)`.
- Pisahkan tarif standard dan fast sebagai data model cost yang eksplisit.
- UI pricing harus menerima model aktif, bukan selalu menampilkan tarif Opus 4.6.
- Tetapkan behavior untuk provider yang tidak melakukan billing internal atau memiliki pricing eksternal.
- Jangan gunakan alias `opus` sebagai key pricing; canonical model harus digunakan.
- Pertahankan `usage.speed` sebagai sumber kebenaran untuk cost request aktual.

**Acceptance criteria:**

- Cost untuk standard dan fast pada model yang sama dapat dibedakan.
- Cost tidak berubah menjadi Opus 4.6 hanya karena `fastMode` bernilai `true`.
- Model unsupported/unknown menghasilkan fallback yang eksplisit dan telemetry yang dapat diaudit.
- UI pricing dan cost calculation menggunakan model yang sama.

**Suite test FM-04:**

- Unit test standard versus fast untuk setiap model yang supported.
- Unit test `usage.speed = 'fast'`, `'normal'`, dan undefined.
- Unit test alias, canonical ID, provider-specific ID, dan Bedrock override.
- Regression test untuk token input, output, cache read/write, dan web search.
- Property/completeness test: setiap model supported memiliki pricing standard; setiap model fast-enabled memiliki pricing fast.

### Task FM-05 — Sinkronkan catalog model dan pricing registry

**Prioritas:** P0  
**Dependensi:** FM-04  
**Tujuan:** Mencegah model valid dicatat sebagai unknown cost.

**Perbaikan yang direkomendasikan:**

- Tambahkan entry pricing untuk semua model yang tersedia dan memang dapat dipilih.
- Pastikan minimal model berikut memiliki keputusan pricing eksplisit: Fable 5.1, Mythos 5.1, Opus 4.7, Opus 4.8, Opus 5, Opus 5.5, Sonnet 5, Sonnet 5.5, dan Haiku 5.5.
- Jika dua model sengaja berbagi tier, nyatakan sharing tersebut melalui konstanta tier yang sama dan test contract.
- Buat comprehensiveness test yang membandingkan `ALL_MODEL_CONFIGS`, model options, canonical mapping, dan `MODEL_COSTS`.
- Tentukan policy untuk model internal/invitation-only agar tidak bocor ke external catalog atau pricing path.

**Acceptance criteria:**

- Setiap model selectable dan supported memiliki canonical pricing entry.
- Model valid tidak memicu `tengu_unknown_model_cost`.
- Fallback hanya terjadi untuk input custom/unknown, bukan model built-in.
- Perubahan default model tidak dapat merge tanpa memperbarui pricing registry atau pengecualian yang diuji.

**Suite test FM-05:**

- Completeness test `ALL_MODEL_CONFIGS` versus `MODEL_COSTS` setelah normalisasi canonical name.
- Completeness test model options versus pricing entries untuk first-party.
- Unit test semua canonical mapping Claude 3, Claude 4, Claude 5, dan Codex.
- Regression test default Opus 5.5 dan Sonnet 5.5.
- Unknown-model test yang memastikan event `tengu_unknown_model_cost` hanya muncul untuk model di luar catalog.

### Task FM-06 — Perketat provider gating dan API contract

**Prioritas:** P0  
**Dependensi:** FM-00, FM-01, FM-04  
**Tujuan:** Mencegah provider yang belum mendukung fast mode menerima state aktif atau payload fast secara keliru.

**Perbaikan yang direkomendasikan:**

- Buat provider capability contract yang menyatakan dukungan speed field, beta header, retry behavior, dan billing.
- Kirim `speed: 'fast'` serta `FAST_MODE_BETA_HEADER` hanya jika seluruh capability provider/model terpenuhi.
- Jika provider belum diverifikasi, fast mode harus unavailable atau inactive; jangan hanya melewati org-status check.
- Pastikan latch header tidak menyebabkan header fast terkirim pada request provider yang tidak mendukungnya.
- Pastikan retry memakai capability yang sama dengan request awal dan tidak menghidupkan kembali fast mode secara tidak sah.

**Acceptance criteria:**

- Tidak ada request fast yang dikirim ke provider/model unsupported.
- Header dan body request selalu konsisten.
- Retry short, cooldown, overload, dan API rejection mempertahankan invariant capability.
- Provider switching antar-session tidak membawa fast-mode state yang invalid.

**Suite test FM-06:**

- Request contract test untuk setiap provider yang supported.
- Negative request test untuk Bedrock/Vertex/Foundry/OpenAI/custom base URL jika capability belum dikonfirmasi.
- Assertion body: `speed` ada hanya pada request fast; nilainya tidak stale setelah cooldown.
- Assertion headers: fast beta header hadir hanya pada request yang diizinkan.
- Retry test: rate limit, overload, API rejection, short retry, dan cooldown expiry.
- Session latch test: header tetap cache-safe tanpa melanggar provider gating.

### Task FM-07 — Tambahkan integration test end-to-end dan verification gate

**Prioritas:** P1  
**Dependensi:** FM-02, FM-03, FM-04, FM-05, FM-06  
**Tujuan:** Membuktikan bahwa semua layer menghasilkan behavior yang sama dari toggle sampai billing.

**Perbaikan yang direkomendasikan:**

- Tambahkan test seam/mock transport pada API boundary, bukan mock terhadap capability policy atau pricing registry.
- Uji alur: pilih model → aktifkan fast mode → kirim request → retry/cooldown → hitung cost → tampilkan status.
- Uji alur dari setiap entry point: `/fast`, `/config`, `/model`, ModelPicker, dan PromptInput.
- Tambahkan CI command untuk test fast mode dan build.
- Karena repository belum memiliki test script, tambahkan script `test` hanya setelah suite awal tersedia dan command-nya stabil.

**Acceptance criteria:**

- Semua test FM-00 sampai FM-06 dapat dijalankan secara deterministik.
- Build berhasil setelah test suite ditambahkan.
- `git diff --check` bersih.
- Tidak ada perubahan source fast mode yang diterima tanpa test capability, state transition, request contract, dan pricing.

**Suite test FM-07:**

- End-to-end happy path untuk tiap model family yang supported.
- End-to-end unsupported provider/model path.
- End-to-end standard fallback setelah rate limit atau API rejection.
- Cross-layer assertion: UI state, API payload, usage speed, pricing, dan telemetry menyatakan model/provider yang sama.
- Verification commands:

```text
bun test
bun run build
bun run build:dev
bunx tsc --noEmit
bunx biome check .
git diff --check
```

Command yang belum tersedia di repository harus ditambahkan sebagai bagian dari test harness task, bukan dianggap telah lulus.

## Urutan implementasi yang disarankan

1. **FM-00** — lock semantics dan capability matrix.
2. **FM-01** — perbaiki model capability first-party.
3. **FM-02** — hapus auto-switch dan samakan state transition.
4. **FM-04** — ubah pricing menjadi model-aware.
5. **FM-05** — lengkapi registry dan completeness tests.
6. **FM-06** — perketat provider/API contract.
7. **FM-03** — sinkronkan UI dan telemetry setelah behavior stabil.
8. **FM-07** — jalankan integration suite dan verification gate.

## Definition of done

Perbaikan fast mode baru dapat dinyatakan selesai apabila seluruh kondisi berikut terpenuhi:

- Fast mode memiliki satu semantics yang terdokumentasi dan dipakai semua entry point.
- Model aktif tidak berubah ketika fast mode modifier diaktifkan.
- Capability provider/model ditentukan secara eksplisit dan fail-closed untuk kombinasi yang belum diverifikasi.
- `speed`, beta header, retry, cooldown, dan API rejection memiliki invariant yang sama.
- Pricing berdasarkan model aktual dan `usage.speed`.
- Semua selectable model memiliki pricing atau pengecualian yang terdokumentasi dan diuji.
- Tidak ada label Opus 4.6-only yang tersisa jika Opsi A diterapkan.
- Unit, contract, regression, component, dan integration test lulus.
- Build, typecheck, lint/format check, dan `git diff --check` lulus.

## Kesimpulan

Review awal benar dalam menemukan akar masalah utama: implementasi fast mode belum konsisten lintas model. Temuan yang paling kritis adalah capability first-party yang masih Opus 4.6-only, auto-switch lintas entry point, hardcoded pricing Opus 4.6, dan pricing registry yang tertinggal dari catalog model.

Satu temuan perlu dikoreksi: pada source saat ini provider non-first-party tidak menghasilkan capability `false`; mereka justru dianggap supported secara blanket. Ini tetap merupakan risiko compatibility yang serius karena belum ada bukti capability per provider.

Tidak ada source code selain dokumen audit ini yang diubah.
