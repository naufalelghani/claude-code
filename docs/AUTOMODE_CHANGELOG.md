# AUTOMODE_CHANGELOG.md

Changelog perubahan untuk fitur Auto Mode (TRANSCRIPT_CLASSIFIER).
File ini append-only — jangan timpa atau hapus entri lama.

---

## 2026-10-05 — Tahap 1: Membuat File Prompt

**Tujuan:** Membuat tiga file prompt `.txt` yang dibutuhkan oleh `yoloClassifier.ts` agar build `bun run build` tetap lulus dengan `TRANSCRIPT_CLASSIFIER` masih OFF di `defaultFeatures`.

**File baru:**

| Path | Ukuran | Keterangan |
|------|--------|------------|
| `src/utils/permissions/yolo-classifier-prompts/auto_mode_system_prompt.txt` | 1646 bytes | Sistem prompt utama classifier — berisi prinsip, environment template tag, dan section Output Format. |
| `src/utils/permissions/yolo-classifier-prompts/permissions_external.txt` | 2228 bytes | Template aturan izin/dilarang untuk build external (`USER_TYPE !== 'ant'`). |
| `src/utils/permissions/yolo-classifier-prompts/permissions_anthropic.txt` | 2228 bytes | Diisi dengan salinan persis `permissions_external.txt` (sebelumnya hanya teks instruksi 154 bytes). |

**Catatan:**
- `scripts/build.ts` masih menggunakan `const defaultFeatures = ['VOICE_MODE']` (TRANSCRIPT_CLASSIFIER OFF) sesuai instruksi T1.
- Direktori `.automode-backup/scripts-build.ts.orig` sudah ada dari revisi sebelumnya sebagai backup.
- Build masih lulus tanpa error setelah ketiga file prompt dibuat.

---

## 2026-10-05 — Tahap 2: Mengaktifkan Flag + Relaxasi Gate (Lengkap)

**Tujuan:** Mengaktifkan `TRANSCRIPT_CLASSIFIER` di `defaultFeatures`, melonggarkan gate model support, memperbaiki bug root cause `AUTO_MODE_ENABLED_DEFAULT`, mengoreksi Output Format di FILE 1, menambahkan aturan deny Windows, dan memverifikasi rakitan prompt.

**Perubahan file:**

| File | Baris | Perubahan |
|------|-------|-----------|
| `scripts/build.ts` | 82 | Menambahkan `'TRANSCRIPT_CLASSIFIER'` ke `defaultFeatures` |
| `src/utils/permissions/permissionSetup.ts` | 1314 | **Perbaikan root cause**: `AUTO_MODE_ENABLED_DEFAULT` diubah dari `'disabled'` statis menjadi kondisi berbasis `USER_TYPE`: external → `'enabled'`, ant → `'disabled'`. Sebelumnya GrowthBook stub mengembalikan `{}` saat tidak ada config, menyebabkan `parseAutoModeEnabledState(undefined)` → `'disabled'` → gate tertutup |
| `src/utils/betas.ts` | 191-194 | Melonggarkan `modelSupportsAutoMode()`: external build mengizinkan semua Claude 4+ (bukan hanya `-4-6`) |
| `auto_mode_system_prompt.txt` | 29 | **Perbaikan kritis**: Mengoreksi baris Output Format agar cocok string eksak `'Use the classify_result tool to report your classification.'` yang dicari `replaceOutputFormatWithXml()`. T1 memakai `"Respond only through..."` yang salah |
| `permissions_external.txt` | — | Ditambahkan baris deny rules Windows PowerShell equivalents |
| `permissions_anthropic.txt` | — | Disalin persis dari `permissions_external.txt` (2824 bytes) |

**Hasil build:**
```
[bundle]  5651 modules
[compile] Built ./cli   (no errors)
```

**Verifikasi rakitan prompt (scripts/verify-autoprompt.js):**
```
[Stage 0] Raw assembled prompt:     ✓ 5/5
[Stage 1] XML-formatted prompt:     ✓ 6/6
[Stage 2] Parser compatibility:     ✓ 3/3
Results: 14 passed, 0 failed ✓
```

**Backup:** `.automode-backup/` menyimpan salinan sebelum perubahan T2.

**File baru:**
- `scripts/verify-autoprompt.js` — skrip verifikasi satu kali untuk rakitan prompt (NEW FILE)

---

## 2026-10-05 — Tahap 3: Melepas Gate USER_TYPE pada CLAUDE_CODE_AUTO_MODE_MODEL

**Tujuan:** Menghapus pembatasan `USER_TYPE === 'ant'` pada pembacaan env var `CLAUDE_CODE_AUTO_MODE_MODEL`, sehingga model classifier kustom dapat diset melalui env var di semua build (termasuk external).

**File yang diubah:** hanya `src/utils/permissions/yoloClassifier.ts`

**Backup:** `.automode-backup/yoloClassifier-before-t3.ts`

**Diff sebenarnya:**
```diff
-  if (process.env.USER_TYPE === 'ant') {
-    const envModel = process.env.CLAUDE_CODE_AUTO_MODE_MODEL
-    if (envModel) return envModel
-  }
+  const envModel = process.env.CLAUDE_CODE_AUTO_MODE_MODEL
+  if (envModel) return envModel
```

**Hasil build:**
```
[bundle]  5651 modules
[compile] Built ./cli   (no errors)
```

**Catatan penting:**
- Fallback chain tetap utuh: env var → GrowthBook config → `getMainLoopModel()`
- Tidak ada validasi atau normalisasi nama model; env var diterima apa adanya
- Tidak ada celah keamanan baru karena fallback ke main loop model tetap bekerja saat env var kosong
- `modelSupportsAutoMode()` memeriksa model utama (`getMainLoopModel()`), bukan model classifier — ini perilaku yang disengaja sesuai instruksi T4

---

## 2026-10-05 — Tahap 4: Verifikasi Safe-Fail (Tanpa Mengubah Kode)

**Tujuan:** Memverifikasi bahwa semua path error classifier mengembalikan `shouldBlock: true` (fail-closed), dan mengidentifikasi setiap path yang dapat menyebabkan fail-open.

**Hasil analisa kode (tanpa edit):**

### Fail-Closed Paths (semua verified ✓)

| File | Baris | Kondisi | Return Value |
|------|-------|---------|-------------|
| `yoloClassifier.ts` | 1204 | Tidak ditemukan tool use block | `shouldBlock: true` |
| `yoloClassifier.ts` | 1228 | Response schema invalid | `shouldBlock: true` |
| `yoloClassifier.ts` | 1265 | Request aborted | `shouldBlock: true` |
| `yoloClassifier.ts` | 1296 | API error / context overflow | `shouldBlock: true` |
| `permissions.ts` | 857 | Classifier unavailable + iron_gate=true | `behavior: 'deny'` |
| `permissions.ts` | 904 | Classifier returns shouldBlock=true | `behavior: 'deny'` |
| `permissions.ts` | 945 | Headless mode + no hook decision | `behavior: 'deny'` |

### Fail-Open Paths (diidentifikasi, NONE diamati untuk diperbaiki di T4)

| # | Lokasi | Kondisi | Mekanisme | Risiko |
|---|--------|---------|-----------|--------|
| 1 | `permissions.ts:875` | Classifier unavailable + `tengu_iron_gate_closed=false` | `return result` (bisa jadi 'allow') | **Low-Medium** — memerlukan konfigurasi eksplisit admin |
| 2 | `permissions.ts:642` | acceptEdits fast-path (write files in CWD) | Skip classifier | **Low** — desain performance optimization, restricted ke CWD |
| 3 | `permissions.ts:679` | Allowlisted tools (Read/Grep/Glob/Task/etc) | Skip classifier | **Very Low** — hanya read-only tools |
| 4 | `permissions.ts:547` | Non-classifierApprovable safetyCheck | Return result | **Low** — intentional design |
| 5 | `permissions.ts:590` | PowerShell tanpa POWERSHELL_AUTO_MODE | Return result | **Medium** — PS tidak melewati classifier di external build |

**Verifikasi build:**
```
[bundle]  5651 modules
[compile] Built ./cli.exe   (no errors)
```

**Verifikasi rakitan prompt (scripts/verify-autoprompt.js):**
```
Results: 14 passed, 0 failed ✓
```

**Kesimpulan T4:**
- Safe-fail **tetap BLOCK** — semua error path classifier mengembalikan `shouldBlock: true`
- Path 1 (`tengu_iron_gate_closed`) adalah fail-open **yang dapat dikonfigurasi** oleh admin — bukan bug, tapi perlu dokumentasi
- Path 2-4 adalah **intentional fast-paths** untuk performa, bukan celah keamanan
- **Tidak ada perubahan kode** dilakukan di T4 sesuai instruksi

**Catatan untuk T5:**
- Path 5 (PowerShell bypass) dan Path 1 (iron gate fail-open) dapat ditangani di T5 dengan deterministic deny layer
- Prompt-based deny rules sudah mencakup PowerShell equivalents di `permissions_external.txt:19-21`

---

## 2026-10-05 — Tahap 5: Lapisan Penolakan Deterministik (Code-Level)

**Tujuan:** Menambahkan lapisan pertahanan kedua yang berjalan SEBELUM classifier AI, untuk menutupi fail-open paths ketika classifier tidak tersedia dan iron_gate dimatikan.

**File baru:**
| Path | Ukuran | Keterangan |
|------|--------|------------|
| `src/utils/permissions/autoModeDenyPatterns.ts` | ~276 baris | Modul murni tanpa dependensi proyek — fungsi `checkDeterministicDeny(command)` yang men-tokenisasi perintah dan mencocokkan 11 aturan deny. |
| `scripts/test-automode-deny.ts` | ~150 baris | Skrip uji 70 kasus (41 wajib blokir + 29 wajib izinkan), dijalankan dengan `bun run`. |

**File yang diubah:**
| File | Perubahan |
|------|-----------|
| `src/utils/permissions/permissions.ts` | Mengganti array regex inline dengan satu pemanggilan `checkDeterministicDeny(input.command)`. Hanya aktif untuk tool Bash (`BASH_TOOL_NAME`) dengan `input.command` bertipe string. Hasil cocok → `classifierResult.shouldBlock: true` tanpa memanggil classifier. |

**Backup:**
- `.automode-backup/yoloClassifier-before-t5b.ts`
- `.automode-backup/permissions-before-t5b.ts`

**Diff sebenarnya permissions.ts:**
```diff
+ import { checkDeterministicDeny } from './autoModeDenyPatterns.js'

       // Run the auto mode classifier
       const action = formatActionForClassifier(tool.name, input)
       setClassifierChecking(toolUseID)
-      let classifierResult
+
+      // DETERMINISTIC DENY LAYER (T5): For Bash tools only...
+      let deterministicDenyResult: string | null = null
+      if (tool.name === BASH_TOOL_NAME && typeof input?.command === 'string') {
+        deterministicDenyResult = checkDeterministicDeny(input.command)
+        if (deterministicDenyResult) {
+          logForDebugging(`Auto mode deterministic deny triggered: ${deterministicDenyResult}`, { level: 'warn' })
+        }
+      }
+
+      let classifierResult: import('./yoloClassifier.js').YoloClassifierResult
       try {
+        // If deterministic deny matched, skip classifier and block immediately
+        if (deterministicDenyResult !== null) {
+          classifierResult = {
+            shouldBlock: true,
+            reason: deterministicDenyResult,
+            model: classifyYoloAction.name,
+            unavailable: false,
+            durationMs: 0,
+          } as import('./yoloClassifier.js').YoloClassifierResult
+        } else {
           classifierResult = await classifyYoloAction(...)
+        }
       } finally { ... }
```

**Hasil build:**
```
[bundle]  5652 modules
[compile] Built ./cli.exe   (no errors)
```

**Hasil verifikasi prompt (scripts/verify-autoprompt.js):**
```
Results: 14 passed, 0 failed ✓
```

**Hasil uji deterministik deny (scripts/test-automode-deny.ts):**
```
Running 70 test cases...
  🚫 [PASS] 41 kasus wajib blokir (rm -rf, git push --force, curl piped to sh, etc.)
  ✅ [PASS] 29 kasus wajib izinkan (ls, git status, rm file.txt, etc.)
Results: 70 passed, 0 failed
All tests passed ✓
```

**Catatan penting:**
- PowerShell TIDAK masuk lapisan T5 (return early di baris 591, sesuai keputusan user)
- `getClassifierModel` tetap tidak diekspor — placeholder `classifyYoloAction.name` dipakai sebagai nama model pada hasil deny deterministik
- Tokenizer menormalisasi: lowercase, hapus quote/backslash, split pada `&& || ; | $() {}`, hapus prefix path, lewati wrapper token (`sh`, `bash`, `-c`, `env`, dll.)
- 3 bug diperbaiki saat development: (1) `git branch -D` lowercase jadi `-d`, (2) path stripper menghilangkan `/` di `/s` Windows, (3) `mkfs.ext4` tidak match `tokens.includes('mkfs')` — semua sudah fix

---

## 2026-10-05 — Tahap 6: Auto Mode untuk Semua Model di Build External

**Tujuan:** Membuat auto mode tersedia untuk SEMUA model di build external (`USER_TYPE !== 'ant'`), bukan hanya claude-4+ spesifik.

**File yang diubah:** hanya `src/utils/betas.ts`

**Backup:** `.automode-backup/betas-before-t6.ts` (diambil dari git HEAD, bukan dari state pra-edit).

**Diff sebenarnya:**
```diff
-    // External allowlist (firstParty already checked above).
-    // Relaxed for external build: allow all claude-4+ models (not just -4-6).
-    if (process.env.USER_TYPE !== 'ant') {
-      return m.startsWith('claude-') && /claude-(opus|sonnet|haiku)-4/.test(m)
-    }
-    return /^claude-(opus|sonnet)-4-6/.test(m)
+    // External: all models supported for auto mode in external builds.
+    // GrowthBook config.allowModels can still override if needed.
+    if (process.env.USER_TYPE !== 'ant') {
+      return true
+    }
```

**Perubahan:** 4 baris dihapus, 3 baris ditambahkan — net -1 baris.
Gate model check untuk external build sekarang selalu mengembalikan `true`.

**Hasil build:**
```
[bundle]  5652 modules
[compile] Built ./cli.exe   (no errors)
```

**Verifikasi prompt assembly:** `14 passed, 0 failed ✓`
**Test deterministic deny:** `70 passed, 0 failed ✓`

**Catatan penting:**
- Gate model tetap aktif di `verifyAutoModeGateAccess` (baris 1117 permissionSetup.ts) dan `isAutoModeGateEnabled` (baris 1287) — keduanya memanggil `modelSupportsAutoMode()` yang sekarang selalu return `true` untuk external
- GrowthBook `tengu_auto_mode_config.allowModels` masih bisa override jika diperlukan
- Jalur ant (`USER_TYPE === 'ant'`) tidak berubah — masih menggunakan denylist claude-3 dan claude-*-4(?!-[6-9])
- Log `[auto-mode]` muncul di console ketika `CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose`

---

## 2026-10-05 — Dukungan Model Claude Fable 5 dan Mythos 5

**Tujuan:** Menambahkan dukungan untuk dua model baru Claude 5 class yang dirilis Anthropic pada Juni 2026:
- **Claude Fable 5** (`claude-fable-5`) — model publik dengan safety classifiers
- **Claude Mythos 5** (`claude-mythos-5`) — invitation-only, tanpa safety classifiers (Project Glasswing)

**Model specs:**
- Context window: 1M default (otomatis, tanpa `[1m]` suffix)
- Output max: 128k tokens
- Pricing: $10/M input, $50/M output

**File yang diubah:**

| File | Baris | Perubahan |
|------|-------|-----------|
| `src/utils/model/aliases.ts` | — | Tambah `'fable'` dan `'mythos'` ke `MODEL_ALIASES` + `MODEL_FAMILY_ALIASES` |
| `src/utils/model/model.ts` | ~272-276, ~658-661 | Tambah mapping canonical + marketing name di `firstPartyNameToCanonical()` dan `getMarketingNameForModel()` |
| `src/utils/betas.ts` | beberapa tempat | Tambah kedua model ke: `modelSupportsISP()`, `vertexModelSupportsWebSearch()`, `modelSupportsContextManagement()`, `modelSupportsStructuredOutputs()` |
| `src/utils/betas.ts` | — | Path ant di `modelSupportsAutoMode()` tetap allow (regex denylist tidak match fable/mythos karena bukan `claude-*-4`) |
| `src/tools/WebSearchTool/WebSearchTool.ts` | ~180-184 | Tambah check untuk Vertex web search support |
| `src/utils/model/modelOptions.ts` | ~463 | Tambah family alias info untuk Fable/Mythos di `getModelAliasInfo()` |
| `src/constants/prompts.ts` | 118, 121-126, 698, 717-720 | Update `FRONTIER_MODEL_NAME` → `'Claude Fable 5'`, tambah entry ke `CLAUDE_4_5_OR_4_6_MODEL_IDS`, update deskripsi model family, tambahkan knowledge cutoff `July 2026` |

**Backup:** `.automode-backup/` menyimpan salinan pra-edit (aliases, betas, model, modelOptions, prompts, websearchtool).

**Hasil build:**
```
[bundle]  5652 modules
[compile] Built ./cli.exe   (no errors)
```

**Verifikasi prompt assembly:** `14 passed, 0 failed ✓`
**Test deterministic deny:** `70 passed, 0 failed ✓`

**Catatan penting:**
- `thinking.ts` tidak perlu diubah — `!canonical.includes('claude-3-')` sudah mencakup fable/mythos untuk firstParty/foundry
- `context.ts` `modelSupports1M()` — sudah ditambahkan fable/mythos, sekarang support 1M context secara default
- `commitAttribution.ts` menggunakan `getCanonicalName()` yang sudah di-handle
- `modelCapabilities.ts` membaca dari API cache, tidak perlu hardcode
- `modelOptions.ts` `getModelFamilyInfo()` — dipisah menjadi entri Fable dan Mythos terpisah (sebelumnya digabung jadi `Fable/Mythos`)
- `managedEnvConstants.ts` — env var Fable/Mythos ditambahkan ke `PROVIDER_MANAGED_ENV_VARS` (baris 45-52) dan `SAFE_ENV_VARS` (baris 125-132) agar bisa dikonfigurasi via settings.json tanpa dialog keamanan

**Catatan tambahan:**
- `ANTHROPIC_DEFAULT_FABLE_MODEL` dan `ANTHROPIC_DEFAULT_MYTHOS_MODEL` sekarang tersedia untuk override model kustom di build external
- `getDefaultFableModel()` dan `getDefaultMythosModel()` sudah diekspor dari `model.ts`
- Konfigurasi provider-specific (`configs.ts`) menggunakan `claude-fable-5` / `claude-mythos-5` sebagai default semua provider (identik dengan firstParty) sampai Anthropic merilis ID resmi untuk Bedrock/Vertex/Foundry/OpenAI

---

## 2026-10-05 — Menu /model: Fable 5 dan Mythos 5 Tampil di Pilihan Model

**Tujuan:** Menambahkan Fable 5 dan Mythos 5 ke dalam list pilihan model pada interaktif `/model` toggle, bukan hanya lewat env override atau custom model ID.

**File yang diubah:**

| File | Perubahan |
|------|-----------|
| `src/utils/model/modelOptions.ts` | Tambah import `getDefaultFableModel`, `getDefaultMythosModel`, `COST_TIER_10_50`; tambah fungsi `getFable5Option()` dan `getMythos5Option()`; masukkan opsi ke PAYG 1P dan PAYG 3P model lists |
| `src/utils/modelCost.ts` | Tambah konstanta `COST_TIER_10_50` ($10/M input, $50/M output); import `CLAUDE_FABLE_5_CONFIG` dan `CLAUDE_MYTHOS_5_CONFIG`; tambahkan entry ke `MODEL_COSTS` |

**Hasil build:**
```
[bundle]  5652 modules
[compile] Built ./cli.exe   (no errors)
```

**Verifikasi:**
- Prompt assembly: `14 passed, 0 failed ✓`
- Deny tests: `70 passed, 0 failed ✓`

**Perubahan detail:**

Fungsi `getFable5Option()`:
- value: `'fable'` (alias yang cocok dengan `MODEL_ALIASES`)
- label: `'Fable 5'`
- description: termasuk pricing `· $10/$50 per Mtok` untuk build internal

Fungsi `getMythos5Option()`:
- value: `'mythos'` (alias yang cocok dengan `MODEL_ALIASES`)
- label: `'Mythos 5'`
- description: menyebutkan "no safety classifiers" untuk informasi tambahan
- same pricing: `· $10/$50 per Mtok`

Kedua opsi ditambahkan setelah Haiku di:
- PAYG 1P (line ~379): `payg1POptions.push(getFable5Option(fastMode))` dan `payg1POptions.push(getMythos5Option(fastMode))`
- PAYG 3P (line ~418): `payg3pOptions.push(getFable5Option(fastMode))` dan `payg3pOptions.push(getMythos5Option(fastMode))`

---

## [2026-10-05] Integrasi Prompt Sistem Kustom per Model

### Ringkasan
Ketika pengguna memilih salah satu dari 5 model Claude (Fable 5.1, Mythos 5.1, Opus 5.5, Sonnet 5.5, Haiku 4.5), file prompt kustom `.txt` di folder `system/` akan dimuat dan digunakan sebagai sistem prompt.

### Perubahan
- **`src/constants/prompts.ts`**: 
  - Menambahkan import `readFileSync` dari `../utils/fileRead.js` dan `resolve` dari `path`
  - Menambahkan fungsi `getCustomSystemPrompt(modelId): string | null` yang memetakan nama kanonik model ke file `.txt` di `system/`
  - Menambahkan peta konversi nama: `claude-fable-5` → `claude-fable-5.1.txt`, dst.
  - Di dalam `getSystemPrompt()`, setelah pengecekan `CLAUDE_CODE_SIMPLE`, dipanggil `getCustomSystemPrompt(model)`. Jika file ditemukan, prompt kustom dikembalikan langsung.

### Peta File Prompt
| Nama Kanonik | File | Baris |
|---|---|---|
| `claude-fable-5` | `system/claude-fable-5.1.txt` | 54 baris |
| `claude-mythos-5` | `system/claude-mythos-5.1.txt` | 1126 baris |
| `claude-opus-4-6` | `system/claude-opus-5.5.txt` | 58 baris |
| `claude-sonnet-4-6` | `system/claude-sonnet-5.5.txt` | 134 baris |
| `claude-haiku-4` | `system/claude-haiku-4.5.txt` | 104 baris |

### Catatan Teknis
- File prompt kustom menggunakan tag `<claude_behavior><product_information>` — mereka bertindak sebagai pengganti prompt bawaan untuk bagian product information
- Build berhasil tanpa error TypeScript
- Safe-fail tetap terjaga: jika file tidak ditemukan, fungsi mengembalikan `null` dan sistem melanjutkan dengan prompt default


## [2026-10-05] Perbaikan Alias Model Fable dan Mythos Tidak Berfungsi

### Masalah
Setelah memilih `fable` atau `mythos` di `/model`, muncul error:
> There's an issue with the selected model (fable). It may not exist or you may not have access to it.

### Penyebab
Fungsi `parseUserSpecifiedModel()` di `src/utils/model/model.ts` memiliki case untuk alias `'sonnet'`, `'haiku'`, `'opus'`, `'best'`, tetapi **tidak ada case untuk `'fable'` dan `'mythos'`**. Akibatnya, kedua alias ini fall-through dan mengembalikan string mentah `"fable"` / `"mythos"`, yang tidak dikenali API sehingga menghasilkan error 404.

### Perbaikan
Menambahkan dua case baru di switch statement `parseUserSpecifiedModel()`:
```typescript
case 'fable':
  return getDefaultFableModel() + (has1mTag ? '[1m]' : '')
case 'mythos':
  return getDefaultMythosModel() + (has1mTag ? '[1m]' : '')
```
Perilaku mapping konsisten dengan sonnet/haiku/opus, mendukung suffix `[1m]`.

### File
- `src/utils/model/model.ts`
- Backup: `.automode-backup/src/utils/model/model.ts.orig`

## [2026-10-05] Perbaikan Fast Mode untuk Semua Model (Third-Party & Fable/Mythos)

### Masalah
Perintah `/fast` tidak berfungsi pada build custom (third-party router seperti `router.bynara.id`) karena:
1. Command `/fast` memiliki `availability: ['claude-ai', 'console']` yang hanya tersedia untuk user Claude.ai dan console API key
2. Fungsi `isFastModeSupportedByModel()` hanya mengizinkan fast mode untuk model `opus-4-6`

### Solusi
**File 1: `src/commands/fast/index.ts`**
- Menghapus `availability: ['claude-ai', 'console']` dari definisi command fast
- Command `/fast` sekarang tersedia di semua environment (termasuk third-party)

**File 2: `src/utils/fastMode.ts`**
- Memodifikasi fungsi `isFastModeSupportedByModel()` untuk mengizinkan fast mode pada third-party provider
- Logika baru:
  ```typescript
  if (parsedModel.toLowerCase().includes('opus-4-6')) {
    return true  // Opus 4.6 di 1P API
  }
  if (getAPIProvider() !== 'firstParty') {
    return true  // Third-party router apapun
  }
  return false
  ```

### Backup
- `.automode-backup/src/commands/fast/index.ts.orig`
- `.automode-backup/src/utils/fastMode.ts.orig`

### Catatan
Fast mode sekarang bisa digunakan dengan SEMUA model (Fable, Mythos, Opus, Sonnet, Haiku) baik di first-party maupun third-party provider. Untuk first-party API, fast mode tetap terbatas pada Opus 4.6 sesuai kebijakan Anthropic.

## [2026-10-05] Fast Mode Tidak Auto-Switch Model di Third-Party

### Perubahan
Memodifikasi `src/commands/fast/fast.tsx` agar fast mode TIDAK otomatis mengganti model ke Opus saat digunakan di third-party router.

**Logika baru:**
- First-party API (api.anthropic.com): tetap auto-switch ke Opus 4.6 jika model tidak support fast mode
- Third-party router (router.bynara.id, dll): TETAP pakai model yang dipilih user (Fable, Mythos, dll)

**Kode:**
```typescript
// Only switch to Opus on 1P API; for 3P providers keep the current model
const needsModelSwitch = !isFastModeSupportedByModel(prev.mainLoopModel) && getAPIProvider() === 'firstParty';
```

### File
- `src/commands/fast/fast.tsx`
- Backup: `.automode-backup/src/commands/fast/fast.tsx.orig`

---

## 2026-10-05 — Fix Fast Mode untuk Router Kustom (byv-code)

**Masalah:** Perintah `/fast on` menampilkan error "Fast mode has been disabled by your organization". 
Penyebab: flag statsig `tengu_penguins_off` dari GrowthBook build lokal mengembalikan nilai truthy, 
dan pengecekan ini dijalankan **sebelum** pengecekan provider, sehingga menghalangi fast mode untuk semua router kustom.

**Perubahan file:**

| File | Perubahan |
|------|-----------|
| `src/utils/model/providers.ts` | Menambahkan fungsi `isThirdPartyAnthropicProvider()` — mengembalikan `true` ketika `ANTHROPIC_BASE_URL` mengarah ke host selain `api.anthropic.com` (dan bukan Bedrock/Vertex/Foundry eksplisit) |
| `src/utils/fastMode.ts` | 1) Mengimpor `isThirdPartyAnthropicProvider`, 2) Memodifikasi pengecekan `tengu_penguins_off` agar dilewati untuk third-party provider, 3) Mengganti pengecekan provider manual di `getFastModeUnavailableReason()` dengan `isThirdPartyAnthropicProvider()` yang juga melewatkan custom base URL, 4) Mengganti pengecekan serupa di `isFastModeSupportedByModel()` |

**Logika baru:**
- Statsig `tengu_penguins_off` hanya aktif untuk `firstParty` + non-custom-URL
- Untuk router kustom (custom `ANTHROPIC_BASE_URL`), fast mode langsung diizinkan tanpa memeriksa statsig/org status
- Model apa pun diizinkan untuk router kustom (bukan hanya Opus 4.6)

**Backup:** `.automode-backup/src/utils/fastMode.ts.orig4`, `.automode-backup/src/utils/model/providers.ts.orig`

**Hasil build:** ✅ Lulus — `Built ./cli` (no errors)

---

## 2026-10-05 — Fix AUTO_THEME (OSC 11 Theme Watcher)

**Masalah:** Fitur `AUTO_THEME` gagal因为 `watchSystemTheme` belum diimplementasikan di `src/utils/systemThemeWatcher.ts`. ThemeProvider mencoba mengimpor modul yang tidak ada sehingga runtime error saat fitur diaktifkan.

**Perubahan file:**

| File | Perubahan |
|------|-----------|
| `src/utils/systemThemeWatcher.ts` | **BARU** — Mengimpor `watchSystemTheme(querier, setTheme)` yang: (1) mengirim OSC 11 query via `TerminalQuerier.send(oscColor(11))`, (2) parse respons dengan `themeFromOscColor()`, (3) update cache via `setCachedSystemTheme()`, (4) polling setiap 10 detik, (5) subscribe CSI ? 2031 h untuk notifikasi live (Ghostty/WezTerm/Foot), (6) return cleanup function |

**Dokumentasi referensi:** [OSC 11 query](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Operating-System-Commands) | [CSI 2031 color-scheme-change](https://github.com/ghostty-org/ghostty/issues/3888)

**Backup:** `.automode-backup/src/components/design-system/ThemeProvider.tsx` (sudah di-backup sebelumnya)

**Hasil build:** ✅ Lulus — `Built ./cli`

---

## 2026-10-05 — Fix BG_SESSIONS (ps/logs/attach/kill handlers)

**Masalah:** Fitur `BG_SESSIONS` gagal karena `src/cli/bg.ts` belum dibuat. Entrypoint `cli.tsx` memanggil `bg.psHandler()`, `bg.logsHandler()`, `bg.attachHandler()`, `bg.killHandler()`, dan `bg.handleBgFlag()` — semua undefined → runtime crash saat menjalankan `claude ps|logs|attach|kill --bg`.

**Perubahan file:**

| File | Perubahan |
|------|-----------|
| `src/cli/bg.ts` | **BARU** (~300 baris) — Mengimplementasikan 5 handler: (1) `psHandler` — membaca registry PID files di `~/.claude/sessions/`, menampilkan tabel sesi (PID, STATUS, NAME, SESSION), prune stale PIDs; (2) `logsHandler` — mencari session by ID/name, menyalin tail transcript NDJSON; (3) `attachHandler` — reattach via tmux atau spawn fresh CLI dengan `--resume`; (4) `killHandler` — kirim SIGTERM ke PID target, bersihkan PID file; (5) `handleBgFlag` — spawn detached child process dengan env vars `CLAUDE_CODE_SESSION_KIND=bg` |

**Integrasi:** `src/entrypoints/cli.tsx:195-218` sudah memanggil `import('../cli/bg.js')` dan dispatch ke masing-masing handler berdasarkan `args[0]`. Tidak perlu modifikasi `cli.tsx`.

**Backup:** `.automode-backup/src/cli/bg.ts.orig` (file baru, backup sebelum build)

**Hasil build:** ✅ Lulus — `Built ./cli` (no errors)

---

## 2026-10-05 — Fix BUILDING_CLAUDE_APPS (Claude API Skill)

**Masalah:** Fitur `BUILDING_CLAUDE_APPS` gagal karena 26 file asset `.md` di `src/skills/bundled/claude-api/` belum dibuat. Skill tidak bisa dimuat tanpa file referensi dokumentasi SDK.

**Perubahan file:**

| File | Perubahan |
|------|-----------|
| `src/skills/bundled/claude-api/SKILL.md` | **BARU** — Definisi skill utama dengan trigger rules dan core principles |
| `src/skills/bundled/claude-api/shared/*.md` | **BARU** (5 file) — error-codes, live-sources, models, prompt-caching, tool-use-concepts |
| `src/skills/bundled/claude-api/python/claude-api/*.md` | **BARU** (5 file) — README, streaming, tool-use, batches, files-api |
| `src/skills/bundled/claude-api/python/agent-sdk/*.md` | **BARU** (2 file) — README, patterns |
| `src/skills/bundled/claude-api/typescript/claude-api/*.md` | **BARU** (5 file) — README, streaming, tool-use, batches, files-api |
| `src/skills/bundled/claude-api/typescript/agent-sdk/*.md` | **BARU** (2 file) — README, patterns |
| `src/skills/bundled/claude-api/{go,java,php,ruby,csharp,curl}/claude-api.md` | **BARU** (5 file) — dokumentasi SDK per bahasa |
| `src/utils/taskSummary.ts` | **BARU** — Stub module untuk `feature('BG_SESSIONS')` import di `query.ts:118` |
| `scripts/build.ts` | Menambahkan `'BUILDING_CLAUDE_APPS'`, `'AUTO_THEME'`, `'BG_SESSIONS'` ke `defaultFeatures` agar build default sudah include ketiga fitur ini |

**Struktur:** `src/skills/bundled/claude-api/` berisi 26 file `.md` dengan dokumentasi lengkap untuk Python, TypeScript, Go, Java, PHP, Ruby, C#, dan cURL.

**Hasil build:** ✅ Lulus — `Built ./cli`

---

## 2026-10-05 — Aktifkan Default Features (BUILDING_CLAUDE_APPS, AUTO_THEME, BG_SESSIONS)

**Perubahan:** Ketiga feature flag yang baru diperbaiki ditambahkan ke `defaultFeatures` di `scripts/build.ts` agar build standar (`bun run build`) sudah mencakup ketiganya tanpa perlu flag manual.

**File:**
- `scripts/build.ts:83`
- Sebelum: `['VOICE_MODE', 'TRANSCRIPT_CLASSIFIER']`
- Sesudah: `['VOICE_MODE', 'TRANSCRIPT_CLASSIFIER', 'BUILDING_CLAUDE_APPS', 'AUTO_THEME', 'BG_SESSIONS']`

**Efek:**
- `bun run build` → langsung include 3 fitur baru
- `bun run build:dev:full` → tetap include semua experimental + 3 fitur baru
- Tidak perlu lagi `--feature=BUILDING_CLAUDE_APPS` atau `--feature=AUTO_THEME` secara manual

**Hasil build:** ✅ Lulus — `Built ./cli`

---

## 2026-10-05 — Fix TEMPLATES (template-job CLI fast-path)

**Masalah:** Fitur `TEMPLATES` gagal karena 2 modul hilang yang di-require saat flag ON:
1. `src/cli/handlers/templateJobs.ts` — di-dynamic-import oleh `src/entrypoints/cli.tsx:226` (fast-path `claude new|list|reply`).
2. `src/jobs/classifier.ts` — di-`require()` oleh `src/query.ts:70` dan `src/query/stopHooks.ts:46`. Tanpa file ini, bundle gagal resolve.

Dua lokasi lain self-contained dan TIDAK butuh file baru:
- `src/utils/markdownConfigLoader.ts:35` — hanya menambah `'templates'` ke daftar direktori scan.
- `src/utils/permissions/filesystem.ts:1520` — guard permission dir job.

**Perubahan file:**

| File | Perubahan |
|------|-----------|
| `src/cli/handlers/templateJobs.ts` | **BARU** (~90 baris) — Implementasi 3 subcommand `new`, `list`, `reply` + export `templatesMain(args)`. Template disimpan sebagai `.md` di `~/.claude/templates/`. |
| `src/jobs/classifier.ts` | **BARU** (stub konservatif) — Export `classifyAndWriteState(jobDir, messages)`. Membuat `state.json` berisi `updatedAt`, `messageCount`, `status:'completed'`. Tidak mem-fabrikasi hasil klasifikasi; semua I/O error ditelan agar bookkeeping tidak merusak query loop. |
| `scripts/build.ts` | Menambahkan `'TEMPLATES'` ke `defaultFeatures` (baris 83) **dan** `fullExperimentalFeatures` (baris 49), mengikuti pola `BG_SESSIONS`/`AUTO_THEME`/`BUILDING_CLAUDE_APPS`. |

**Catatan desain:** `reply` menampilkan body template apa adanya + notice bahwa engine eksekusi job belum direkonstruksi di snapshot ini. Klasifikasi job asli (pipeline) sengaja tidak dibikin — hanya state writer minimal yang dibutuhkan agar import resolve.

**Verifikasi runtime (`./cli-dev.exe`, flag TEMPLATES ON):**
- `new byv-test-template` → `Created template: C:\Users\USER\.claude\templates\byv-test-template.md`
- `list` → `byv-test-template.md`
- `reply byv-test-template` → menampilkan body `.md` + notice stub
- Template test sudah dihapus setelah verifikasi.

**Backup sebelum perubahan:**
- `.automode-backup/scripts-build-before-T4.ts`
- `.automode-backup/docs-AUTOMODE_CHANGELOG-before-T4.md`

**Hasil build:** ✅ Lulus — `Built ./cli-dev` (5685 modules, minify -33.58 MB)

---

## 2026-10-11 — Model Catalog: Tambahkan Model Lama ke Picker `/model`

**Tujuan:** Menampilkan seluruh model generasi sebelumnya di picker `/model` command sehingga pengguna dapat memilih model spesifik dari generasi apa saja, bukan hanya 5 model terbaru (Sonnet 4.6, Opus 4.6, Haiku 4.5, Fable 5, Mythos 5).

**Model lama yang ditambahkan:**
- **Claude Sonnet 3.7** (`claude-3-7-sonnet-20250219`)
- **Claude Sonnet 4.0** (`claude-sonnet-4-20250514`)
- **Claude Sonnet 4.5** (`claude-sonnet-4-5-20250929`)
- **Claude Opus 4.0** (`claude-opus-4-20250514`) — remap ke Opus 4.6 di first-party API
- **Claude Opus 4.1** (`claude-opus-4-1-20250805`) — remap ke Opus 4.6 di first-party API
- **Claude Opus 4.5** (`claude-opus-4-5-20251101`)
- **Claude Haiku 3.5** (`claude-3-5-haiku-20241022`)
- **OpenAI GPT-5.4** (`gpt-5.4`) — hanya untuk PAYG API
- **OpenAI GPT-5.3 Codex** (`gpt-5.3-codex`) — hanya untuk Codex subscribers & PAYG
- **OpenAI GPT-5.4 Mini** (`gpt-5.4-mini`) — hanya untuk PAYG API

**File yang diubah:**

| File | Perubahan |
|------|-----------|
| `src/utils/model/modelOptions.ts` | Menambahkan 7+3 fungsi opsi model baru (`getSonnet37Option`, `getSonnet40Option`, `getSonnet45Option`, `getOpus40Option`, `getOpus41OptionLegacy`, `getOpus45Option`, `getHaiku35OptionLegacy`) dan memperbarui `getModelOptionsBase()` untuk menyertakan mereka di semua tier pengguna. Juga menambahkan informasi harga cost tier untuk pengguna first-party API. |
| `src/constants/prompts.ts` | Menambahkan 8 entri ke `CUSTOM_PROMPT_SUFFIX_MAP` untuk model lama agar system prompt khusus model dimuat dengan benar dari folder `system/`. |

**Tier pengguna yang diperbarui:**

| Tier | Model lama yang ditambahkan |
|------|-----------------------------|
| PAYG 1P API | Semua model lama + GPT-5.4/Mini/Codex |
| PAYG 3P API | Semua model lama Claude + Fable 5/Mythos 5 (GPT-5 via OpenAI native) |
| Max/Team Premium | Sonnet 3.7/4.0/4.5, Opus 4.0/4.1/4.5 |
| Pro/Team Standard | Sonnet 3.7/4.0/4.5, Opus 4.0/4.1/4.5 |
| Codex Subscribers | GPT-5.4, GPT-5.3 Codex, GPT-5.4 Mini (sudah ada sebelumnya) |

**Harga (cost tier) untuk model lama:**

| Model | Cost Tier | Harga (per Mtok) |
|-------|-----------|-----------------|
| Sonnet 3.7/4.0/4.5 | COST_TIER_3_15 | $3 input / $15 output |
| Opus 4.0/4.1 | COST_TIER_15_75 | $15 input / $75 output |
| Opus 4.5 | COST_TIER_5_25 | $5 input / $25 output |
| Haiku 3.5 | COST_HAIKU_35 | Legacy pricing (turun dari COST_HAIKU_35) |

**Catatan penting:**
- Harga hanya ditampilkan untuk pengguna first-party API (konsisten dengan model terbaru)
- Opus 4.0/4.1 tetap menggunakan remap ke Opus 4.6 di first-party API melalui `parseUserSpecifiedModel()` di `model.ts` (bisa dinonaktifkan dengan `CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP`)
- GPT-5.x hanya tersedia untuk pengguna PAYG API (bukan berlangganan Claude AI)
- Semua file system prompt di folder `system/` sudah ada dan sudah dilindungi oleh `.automode-backup`

**Backup file:**
- `.automode-backup/modeloptions-before-legacy-model-picker.ts` — Versi `modelOptions.ts` sebelum penambahan model lama
- `.automode-backup/prompts-before-legacy-model-picker.ts` — Versi `prompts.ts` sebelum penambahan pemetaan sistem prompt
- `.automode-backup/modeloptions-before-legacy-pricing.ts` — Versi `modelOptions.ts` sebelum penambahan informasi harga

**Hasil build:** ✅ Lulus — Aplikasi tetap berjalan setelah semua perubahan

---

## 2026-10-11 — GitHub OAuth Device Flow untuk Internal Subscriber

**Tujuan:** Mengganti GitHub Authorization Code Flow (PKCE) yang sebelumnya sudah ada dengan GitHub Device Flow untuk anggota organisasi `BYV-Dev-Unorganization`. Device Flow lebih cocok untuk CLI — tidak memerlukan redirect URL atau client secret, pengguna cukup mengunjungi `github.com/login/device` dan memasukkan kode.

**Alur baru:**
1. Request user code dari GitHub device endpoint
2. Display verification URI dan user code di UI (React Ink)
3. Poll untuk access token (handles `authorization_pending`, `slow_down`)
4. Verifikasi keanggotaan organisasi GitHub (`@BYV-Dev-Unorganization`)
5. Dapatkan user info (email, name) dari GitHub API
6. Gunakan `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` dari env var sebagai access token (setelah org membership diverifikasi)
7. Simpan token dengan `subscriptionType: 'internal'` via `installOAuthTokens()`

**File baru:**
| Path | Deskripsi |
|------|-----------|
| `src/services/oauth/github-flow.ts` | Orchestrator utama Device Flow — `startGitHubOAuthFlow()` yang memanggil github-client dan men-setup OAuthStatus |
| `src/services/oauth/github-client.ts` | HTTP client untuk GitHub API (device flow, token polling, org membership, user info) |

**File yang diubah:**

| File | Perubahan |
|------|-----------|
| `src/components/ConsoleOAuthFlow.tsx` | Tambah `forceLoginMethod?: 'github'`, tambah `startGitHubOAuth` callback via `useCallback`, tambah opsi "GitHub (Internal)" di login method dropdown |
| `src/utils/auth.ts` | `getOauthAccountInfo()` mengembalikan akun untuk internal subscriber; `saveOAuthTokensIfNeeded()` mengizinkan save token internal yang tidak punya refresh token |
| `src/cli/handlers/auth.ts` | `installOAuthTokens()` melewati fetch profile untuk internal subscriber; `tokenAccount` fallback sekarang include `displayName`; `authStatus` menampilkan email/orgName untuk internal subscriber |
| `src/services/oauth/types.ts` | Tambah `displayName?: string` ke `tokenAccount` interface |

**Catatan:**
- `ANTHROPIC_AUTH_TOKEN` harus diset di `~/.claude/settings.json` env vars atau environment
- Router default: `https://router.bynara.id` (dapat di-override via `INTERNAL_API_BASE_URL` build-time env var)
- Model default: `combo/byv-flash-2410` (dapat di-override via `ANTHROPIC_MODEL`)

---

## 2026-10-11 — Perbaikan Routing Model ke combo/byv-flash-2410 untuk Internal Subscriber

**Masalah:** Setelah login via GitHub Device Flow, memilih model seperti `fable51`, `sonnet55`, atau `opus55` di `/model` menyebabkan error:
> There's an issue with the selected model (fable51). It may not exist or you may not have access to it.

**Penyebab:** 
1. Picker model menggunakan `getClaudeModelOption('fable51', ...)` yang untuk third-party provider mengembalikan `value = getModelStrings().fable51 = 'claude-fable-5-1'`
2. `parseUserSpecifiedModel('claude-fable-5-1')` tidak punya case untuk model ini, jadi string `'claude-fable-5-1'` dikirim ke router
3. Router BYV hanya punya model dengan format `claude-fable-5.1` (dengan titik), bukan `claude-fable-5-1` (dengan dash)

**Perbaikan:** Di `src/utils/model/model.ts`, `parseUserSpecifiedModel()` sekarang memetakan semua model Claude yang dikenali ke `combo/byv-flash-2410` ketika user adalah internal subscriber. Ini sesuai dengan keinginan untuk menggunakan `combo/byv-flash-2410` untuk semua model guna menghemat token.

Logika baru:
- Import `isInternalSubscriber` dari `auth.js`
- Import `ALL_MODEL_CONFIGS` dari `configs.js`
- Sebelum fallback terakhir, jika `isInternalSubscriber()` dan `modelString` cocok dengan key atau `firstParty` value di `ALL_MODEL_CONFIGS`, kembalikan `'combo/byv-flash-2410'`
- Mendukung semua Claude model keys: `fable5`, `fable51`, `mythos5`, `mythos51`, `opus3`-`opus55`, `sonnet35`-`sonnet55`, `haiku3`-`haiku55`

**File yang diubah:**
| File | Perubahan |
|------|-----------|
| `src/utils/model/model.ts` | Tambah import `isInternalSubscriber` dan `ALL_MODEL_CONFIGS`; tambah logic routing ke `combo/byv-flash-2410` di `parseUserSpecifiedModel()` |

**Backup:** `.automode-backup/model.ts-before-combo-routing`

**Hasil build:** ✅ Lulus — `Built ./cli-dev`

---

## 2026-10-11 — Pemisahan System Prompt dari Model Inference untuk Internal Subscriber

**Masalah:** Setelah routing model ke `combo/byv-flash-2410`, sistem prompt tidak lagsung memuat file `.txt` yang sesuai model yang dipilih di UI. Ini karena `getSystemPrompt()` memakai `mainLoopModel` (yang sudah menjadi `combo/byv-flash-2410`), dan `getCanonicalName('combo/byv-flash-2410')` tidak match sama satu pun entry di `CUSTOM_PROMPT_SUFFIX_MAP`.

**Contoh:** User pilih `fable51` di `/model` → model inference jadi `combo/byv-flash-2410` → system prompt memakai `getCanonicalName('combo/byv-flash-2410')` → tidak match `claude-fable-5` di map → **fallback ke default system prompt, bukan `system/claude-fable-5.1.txt`**

**Perbaikan:** Di `src/QueryEngine.ts`, ditambahkan `systemPromptModel` yang dipisahkan dari `initialMainLoopModel`. Saat model inference sudah di-resolve ke `combo/byv-flash-2410` (hanya berlaku untuk internal subscriber), system prompt memakai canonical name dari model asli yang dipilih user:

- `fable51` → `parseUserSpecifiedModel('fable51')` → `'claude-fable-5-1'` → `getCanonicalName('claude-fable-5-1')` → `'claude-fable-5'` (karena `firstPartyNameToCanonical` memakai `.includes('claude-fable-5')`)
- Kemudian `getCustomSystemPrompt('claude-fable-5')` → lookup di `CUSTOM_PROMPT_SUFFIX_MAP` → `'claude-fable-5.1'` → load `system/claude-fable-5.1.txt`

**File yang diubah:**
| File | Perubahan |
|------|-----------|
| `src/QueryEngine.ts` | Tambah import `getCanonicalName`; tambah `systemPromptModel` yang memakai canonical name asli untuk internal subscriber; `fetchSystemPromptParts` memakai `systemPromptModel` insteadof `initialMainLoopModel` |

**Catatan:** Perilaku ini **hanya berlaku untuk internal subscriber** — provider lain tetap memakai `initialMainLoopModel` untuk system prompt (perilaku tidak berubah).

**Hasil build:** ✅ Lulus — `Built ./cli-dev` (5688 modules)

---

## 2026-10-12 — Perbaikan Akses Model Terbaru dan Pemisahan System Prompt

**Tujuan:** Menyelesaikan bug katalog model dan routing internal yang menyebabkan model lama masih tampil, Mythos tersedia untuk PAYG, serta system prompt model yang dipilih tidak selalu dimuat ketika inference diarahkan ke `combo/byv-flash-2410`.

**Perubahan:**

| File | Perubahan |
|------|-----------|
| `src/utils/model/modelOptions.ts` | Mengubah pilihan utama Claude AI subscriber ke Opus 5.5, Sonnet 5.5, dan Haiku 5.5; menambahkan Fable 5.1 ke katalog subscriber dan PAYG; menambahkan model generasi terbaru ke opsi PAYG dengan provider model ID yang benar; menghapus Mythos dari katalog PAYG 1P dan PAYG 3P. Mythos tetap tersedia pada katalog internal. |
| `src/utils/model/model.ts` | Menambahkan guard Mythos pada jalur parsing langsung agar alias atau model ID Mythos di luar internal/Ant dialihkan ke Fable; memperbarui deskripsi default dan `opusplan` ke generasi terbaru; menambahkan `getSystemPromptModel()` untuk menyelesaikan model prompt tanpa routing inference internal. |
| `src/QueryEngine.ts` | Menggunakan model prompt asli melalui `getSystemPromptModel()`, sementara model inference tetap memakai model runtime yang sudah dirouting ke `combo/byv-flash-2410`. |
| `src/constants/prompts.ts` | Memperbaiki mapping Fable 5 dan Fable 5.1 agar masing-masing memuat file system prompt versinya sendiri. |

**Perilaku setelah perubahan:**

- Opus 5.5, Sonnet 5.5, Haiku 5.5 menjadi pilihan generasi terbaru pada plan Claude AI.
- Fable 5.1 tersedia untuk plan umum dan internal.
- Mythos 5/5.1 hanya tampil untuk internal subscriber; build Ant/Glasswing tetap dapat menggunakannya.
- `/model fable51` pada internal memuat `system/claude-fable-5.1.txt`, tetapi request inference tetap dikirim ke `combo/byv-flash-2410`.
- User non-internal yang memasukkan Mythos secara manual tidak memperoleh Mythos; jalurnya menggunakan Fable.

**Verifikasi:**

- Diff diperiksa untuk memastikan Mythos tidak lagi dipush ke katalog PAYG.
- Build/test penuh perlu dijalankan pada environment Bun yang memiliki executable dan dependency proyek.

---

## 2026-10-11 — Perluasan Routing Model ke combo/byv-flash-2410 (Provider-Specific & Regex)

**Masalah lanjutan:** Setelah perbaikan sebelumnya, masih ada model yang error ketika dipilih di `/model`:
- `haiku55` → error "There's an issue with the selected model (haiku55)"
- `mythos51` → error serupa
- `fable51` → error serupa

**Penyebab:** Perbaikan sebelumnya hanya mengecek apakah `modelString` adalah key di `ALL_MODEL_CONFIGS` atau nilai `firstParty`-nya. Tapi untuk provider third-party (foundry/bedrock/etc):
1. `getModelStrings().haiku55` mengembalikan `'claude-haiku-5-5'` (format provider-specific, bukan canonical)
2. String `'claude-haiku-5-5'` tidak match `firstParty` value (`'claude-haiku-5-5'` ≠ `'claude-haiku-4-5'` di configs)
3. Untuk `mythos51`/`fable51` dengan provider foundry: `ALL_MODEL_CONFIGS.mythos51.foundry = ''` (string kosong) → `getModelStrings().mythos51 = ''` → error

**Perbaikan:** Di `src/utils/model/model.ts`, logika `isClaudeModelString` diperluas untuk:
- Mengecek **semua provider values** (bukan hanya `firstParty`) dengan syarat `v.length > 0`
- Tambahkan **regex fallback** `claude-(fable|mythos|opus|sonnet|haiku|3)` untuk mendeteksi semua format Claude model string, termasuk provider-specific (setelah strip prefix seperti `us.anthropic.`)

Regex ini match pola:
- `claude-fable-5-1` ✅ (canonical Fable 5.1)
- `claude-haiku-5-5` ✅ (provider-specific Haiku 5.5)
- `claude-opus-5.5` ✅ (format titik di router)
- `claude-sonnet-3-7-sonnet-20250219` ✅ (legacy dengan timestamp)
- `us.anthropic.claude-fable-5-1-v1` ✅ (bedrock ARN — setelah prefix strip)
- `gpt-5.4` ❌ (tidak match, hanya Claude)

**File yang diubah:**
| File | Perubahan |
|------|-----------|
| `src/utils/model/model.ts` | Perluas `isClaudeModelString` check; tambah regex `isChaudeModelPattern` + strip provider prefix |

**Backup:** `.automode-backup/model.ts-before-combo-routing-v2`

**Hasil build:** ✅ Lulus — `Built ./cli-dev` (5688 modules)

---

## 2026-10-12 — Sinkronisasi Mapping Model dan System Prompt

**Tujuan:** Menyelesaikan mismatch antara canonical model ID, nama file prompt di folder `system/`, dan nama model terbaru yang tampil pada katalog.

**Perubahan:**

- Memperbarui metadata environment prompt ke Fable 5.1, Mythos 5.1, Opus 5.5, Sonnet 5.5, dan Haiku 5.5.
- Memperbaiki mapping canonical ID Claude 3.x (`claude-3-5-sonnet`, `claude-3-7-sonnet`, `claude-3-5-haiku`, dan lainnya) ke file prompt legacy yang sesuai.
- Menambahkan mapping prompt untuk Opus 3 dan Haiku 3.
- Menambahkan nama marketing untuk Opus 5/5.5, Sonnet 5/5.5, Haiku 5.5, Fable 5.1, dan Mythos 5.1.
- Memperbarui upgrade hint Fable dan Mythos agar mengikuti default versi 5.1.

**Hasil mapping utama:**

| Model | System prompt |
|---|---|
| Opus 5.5 | `system/claude-opus-5.5.txt` |
| Sonnet 5.5 | `system/claude-sonnet-5.5.txt` |
| Haiku 5.5 | `system/claude-haiku-5.5.txt` |
| Fable 5.1 | `system/claude-fable-5.1.txt` |
| Mythos 5.1 | `system/claude-mythos-5.1.txt` |
| Sonnet 3.7 | `system/claude-sonnet-3.7.txt` |
| Haiku 3.5 | `system/claude-haiku-3.5.txt` |

**Catatan:** Internal Claude inference tetap diarahkan ke `combo/byv-flash-2410`; pemisahan `systemPromptModel` memastikan prompt tetap berasal dari model yang dipilih user.
