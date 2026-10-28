# Arsitektur REPL Plugin Contributions

## Tujuan

Dokumen ini mendefinisikan desain untuk membuat kontribusi UI dan lifecycle ke REPL melalui plugin. Kontribusi yang ditargetkan meliputi:

- live pane di sisi kanan
- status line atau band
- toast notification
- lifecycle hook
- command atau kontribusi plugin lain yang dapat ditambahkan kemudian

Desain ini memisahkan proses pembuatan plugin dari runtime REPL. Command `/plugin-authoring` bertindak sebagai authoring flow, sedangkan registry dan layout REPL bertindak sebagai runtime infrastructure.

## Prinsip utama

1. **Intent command terstruktur, detail tetap bebas.**
   `create panel`, `create status-line`, dan `create toast` menentukan jenis kontribusi. Detail desain ditulis menggunakan prompt natural-language bebas.
2. **Authoring tidak memiliki layout knowledge yang berlebihan.**
   `/plugin-authoring` membuat atau memodifikasi plugin, tetapi tidak menjadi pemilik `REPL` atau `FullscreenLayout`.
3. **Runtime memakai registry.**
   Plugin mendaftarkan kontribusinya melalui registry. REPL hanya membaca kontribusi aktif dan merender slot yang sesuai.
4. **Preview dan confirmation diperlukan sebelum menulis file.**
   Authoring flow harus menampilkan rencana atau diff sebelum perubahan diterapkan.
5. **Hot reload adalah bagian dari lifecycle.**
   Setelah plugin berubah, command dapat memuat ulang kontribusi tanpa memulai ulang seluruh session jika runtime mendukungnya.
6. **Fullscreen dan non-fullscreen memiliki fallback berbeda.**
   Right-side panel hanya benar-benar dapat menjadi panel horizontal pada fullscreen layout. Mode non-fullscreen harus menggunakan fallback sequential atau menyembunyikan kontribusi yang tidak kompatibel.

## User-facing command

Command utama:

```text
/plugin-authoring create panel <prompt bebas>
/plugin-authoring create status-line <prompt bebas>
/plugin-authoring create toast <prompt bebas>
/plugin-authoring create hook <prompt bebas>
/plugin-authoring list
```

Prompt boleh berada pada baris yang sama:

```text
/plugin-authoring create panel Buat panel kanan untuk menampilkan background tasks dan status agent aktif.
```

Prompt juga boleh diberikan melalui input interaktif jika command tidak memiliki prompt:

```text
/plugin-authoring create panel
```

Kemudian UI meminta:

```text
Jelaskan panel yang ingin dibuat:

> _
```

### Contoh penggunaan

```text
/plugin-authoring create panel Buat panel kanan untuk menampilkan background tasks, bisa dibuka dengan Ctrl+P, dapat di-resize, dan otomatis tertutup pada terminal kurang dari 100 kolom.
```

```text
/plugin-authoring create status-line Tampilkan model aktif, token usage, durasi request, dan status MCP.
```

```text
/plugin-authoring create toast Tampilkan notifikasi ketika background task selesai atau gagal.
```

```text
/plugin-authoring create hook Catat setiap Bash tool call dan minta approval tambahan sebelum command dijalankan.
```

```text
/plugin-authoring list
```

`list` tidak membutuhkan prompt. Command tersebut menampilkan kontribusi plugin yang tersedia atau terpasang berdasarkan registry runtime.

## Model parsing command

Parser hanya bertugas memisahkan action, contribution type, dan prompt. Parser tidak mencoba memahami detail desain di dalam prompt.

```ts
 type PluginAuthoringCommand =
  | {
      action: 'create';
      type: 'panel' | 'status-line' | 'toast' | 'hook';
      prompt?: string;
    }
  | {
      action: 'list';
    };
```

Contoh:

```text
Input:
  /plugin-authoring create panel Buat panel kanan untuk task aktif

Hasil parsing:
  action = create
  type   = panel
  prompt = "Buat panel kanan untuk task aktif"
```

Jika prompt kosong, parser tetap menghasilkan intent yang valid dan authoring flow membuka input multiline.

```text
/plugin-authoring create panel
```

```text
{
  action: 'create',
  type: 'panel',
  prompt: undefined,
}
```

## Authoring flow

Alur umum:

```text
/plugin-authoring create <type> <prompt>
        ↓
parse action + type + prompt
        ↓
jika prompt kosong, minta prompt interaktif
        ↓
interpretasi natural-language request
        ↓
validasi kebutuhan dan batasan runtime
        ↓
generate atau update plugin files
        ↓
tampilkan preview/diff
        ↓
user confirmation
        ↓
write files
        ↓
reload atau aktivasi plugin
```

Authoring flow sebaiknya dapat menanyakan detail yang belum jelas, misalnya:

- panel terbuka secara default atau tidak
- shortcut untuk membuka dan menutup panel
- data yang ditampilkan
- sumber event
- lebar panel
- behavior pada terminal sempit
- state yang bersifat session-only atau persistent
- apakah perubahan perlu mengubah file plugin yang sudah ada

Contoh hasil interpretasi internal:

```ts
type PluginAuthoringIntent = {
  kind: 'panel' | 'status-line' | 'toast' | 'hook';
  prompt: string;
  placement?: 'right' | 'bottom' | 'status';
  lifecycle?: 'session' | 'persistent';
  requiresConfirmation: boolean;
};
```

Tipe internal tersebut adalah hasil authoring flow. User tidak perlu menuliskannya secara manual.

## Layer arsitektur

```text
User prompt
    ↓
/plugin-authoring local JSX command
    ↓
Authoring flow
    ├── parse command intent
    ├── collect missing requirements
    ├── generate plugin artifact
    ├── show preview/diff
    └── apply after confirmation
    ↓
Plugin files and manifest
    ↓
Plugin loader / reload lifecycle
    ↓
Contribution registry
    ├── panel registry
    ├── status-line registry
    ├── toast registry
    └── hook registry
    ↓
REPL runtime
    ├── FullscreenLayout
    ├── PromptInputFooter
    ├── notification layer
    └── hook execution layer
```

### Authoring layer

Authoring layer bertanggung jawab atas:

- menerima command dan prompt bebas
- memahami intent user
- menghasilkan file plugin
- memodifikasi plugin yang sudah ada
- menampilkan preview
- meminta confirmation
- menjalankan reload setelah perubahan

Authoring layer tidak boleh meng-hardcode detail setiap screen plugin di `REPL.tsx`.

### Runtime layer

Runtime layer bertanggung jawab atas:

- memuat plugin aktif
- mendaftarkan kontribusi
- menentukan kontribusi yang terlihat
- merender slot UI
- menghubungkan lifecycle event
- menghapus registry entry saat plugin di-unload

## Plugin contribution types

### Panel

Panel adalah UI yang menempati area khusus, terutama sisi kanan fullscreen layout.

```text
┌──────────────────────────────────────────────────────────────┐
│ Terminal viewport                                            │
│                                                              │
│ ┌──────────────────────────────────────┐ ┌─────────────────┐ │
│ │ Main conversation                    │ │ Plugin panel     │ │
│ │ Messages                             │ │                 │ │
│ │ Tool output                          │ │ Plugin UI       │ │
│ │ Streaming output                     │ │                 │ │
│ └──────────────────────────────────────┘ └─────────────────┘ │
│                                                              │
│ Prompt input / footer                                        │
└──────────────────────────────────────────────────────────────┘
```

Panel minimal yang dihasilkan plugin dapat memiliki metadata berikut:

```ts
type PluginPanel = {
  id: string;
  title: string;
  render: () => React.ReactNode;
  width?: number;
  shortcut?: string;
};
```

`width` menggunakan terminal columns, bukan persentase CSS.

Panel mendukung state:

```text
closed
open
collapsed
```

Interaksi awal yang disarankan:

```text
shortcut toggle → membuka/menutup panel
Esc             → menutup panel aktif
Ctrl+Left       → memperkecil panel
Ctrl+Right      → memperbesar panel
```

### Status line

Status line adalah kontribusi ringkas yang dirender pada area status atau footer. Ia harus memperhatikan terminal width dan boleh disembunyikan pada terminal pendek.

Contoh kebutuhan:

```text
model · 12.4k tokens · 3.2s · MCP connected
```

Status line tidak boleh mengambil ruang besar dari conversation viewport. Jika ruang tidak cukup, status line harus truncate atau tidak dirender.

### Toast

Toast adalah notifikasi sementara yang muncul berdasarkan event.

Contoh event:

- background task selesai
- plugin selesai di-load
- koneksi MCP berubah
- hook gagal
- operasi authoring selesai

Toast perlu memiliki lifecycle eksplisit:

```text
created → visible → expired/dismissed
```

Timer atau subscription toast harus dibersihkan ketika kontribusi di-unload.

### Hook

Hook bukan komponen visual. Hook mendaftarkan behavior pada lifecycle event, misalnya sebelum atau sesudah tool dijalankan.

Hook harus mendefinisikan:

- event yang diamati
- input event
- output atau side effect
- error behavior
- cancellation/cleanup
- permission boundary jika hook memerlukan approval

## Right panel runtime

Komponen layout yang menjadi boundary utama adalah:

```text
src/components/FullscreenLayout.tsx
```

API konseptualnya:

```tsx
<FullscreenLayout
  scrollable={<Messages ... />}
  bottom={<PromptInput ... />}
  rightPanel={<PluginPanel />}
  rightPanelOpen={isOpen}
  rightPanelWidth={panelWidth}
  onCloseRightPanel={close}
/>
```

Dalam fullscreen mode, struktur layout menjadi:

```tsx
<Box flexGrow={1} flexDirection="column">
  <Box flexDirection="row" flexGrow={1}>
    <Box flexGrow={1} overflow="hidden">
      <ScrollBox>
        {scrollable}
      </ScrollBox>
    </Box>

    {rightPanel}
  </Box>

  {bottom}
  {modal}
</Box>
```

Tanggung jawab `FullscreenLayout`:

- menghitung ruang horizontal
- merender divider panel
- mempertahankan scroll region conversation
- menjaga bottom slot tetap fixed
- menangani modal dan overlay
- menerapkan responsive behavior

Tanggung jawab plugin:

- isi panel
- state domain panel
- event yang dibutuhkan
- label dan shortcut metadata
- cleanup kontribusi

## Panel state dan provider

Hook/provider digunakan untuk state, bukan untuk menggantikan layout.

```ts
const {
  activePanelId,
  isOpen,
  open,
  close,
  toggle,
  width,
  setWidth,
} = useRightPanel();
```

Pembagian tanggung jawab:

```text
RightPanelProvider / useRightPanel
├── active panel
├── open / close / toggle
├── panel width
├── keyboard state
└── responsive state

FullscreenLayout
├── panel position
├── panel dimensions
├── border/divider
└── interaction area

Plugin
└── panel content
```

Provider harus menghindari global mutable state tersembunyi. State panel sebaiknya terhubung ke AppState atau context yang lifecycle-nya sama dengan session.

## Panel registry

Registry menyimpan kontribusi aktif tanpa membuat `FullscreenLayout` mengetahui plugin tertentu.

```text
PanelRegistry
├── registerPanel()
├── unregisterPanel()
├── getPanel()
└── listPanels()
```

Alur pendaftaran:

```text
plugin load
    ↓
register panel metadata + renderer
    ↓
activePanelId dipilih oleh user atau plugin policy
    ↓
FullscreenLayout merender rightPanel
```

Saat plugin di-unload:

```text
plugin unload
    ↓
unregister panel
    ↓
close active panel jika panel tersebut aktif
    ↓
cleanup listeners/timers/subscriptions
```

## Responsive behavior

Panel menggunakan terminal dimensions melalui `useTerminalSize()`.

Kebijakan awal:

```text
columns >= 100 → split panel normal
columns 80-99  → panel boleh dibuka dengan width compact
columns < 80   → panel ditutup atau diubah menjadi modal
```

Panel tidak boleh membuat prompt input tidak dapat digunakan. Prioritas ruang:

```text
prompt input > conversation visibility > footer decoration > optional panel
```

Pada mode non-fullscreen, right-side panel tidak dapat benar-benar ditempatkan di samping karena output dirender sequential ke terminal scrollback. Fallback yang dapat dipilih:

```text
1. sembunyikan side panel
2. tampilkan panel sebagai dialog sequential
3. tampilkan ringkasan panel sebagai status/notification
```

Default yang disarankan adalah tidak merender right-side panel sebagai side panel pada non-fullscreen mode.

## Hot reload dan lifecycle

Plugin yang dibuat atau diubah melalui `/plugin-authoring` harus dapat direload dengan lifecycle yang jelas:

```text
load
  ↓
register contributions
  ↓
active
  ↓
unload/reload
  ↓
unregister contributions
  ↓
cleanup resources
```

Resource yang harus memiliki cleanup:

- event listener
- terminal subscription
- interval dan timeout
- file watcher
- network connection
- panel registry entry
- hook registration
- toast queue subscription

Reload tidak boleh meninggalkan panel atau hook lama yang masih aktif.

## Preview dan confirmation

Authoring flow harus menampilkan minimal:

```text
Plugin name
Contribution type
Files to create or modify
Runtime integration points
Keyboard shortcuts
Potential layout impact
```

Contoh preview:

```text
Saya akan membuat:

Plugin: task-monitor
Type: right panel

Files:
  + .claude-plugin/plugin.json
  + panels/task-monitor.tsx
  + panels/register.ts

Behavior:
  - toggle dengan Ctrl+P
  - width awal 36 columns
  - ditutup otomatis di bawah 80 columns
  - refresh ketika task state berubah

Terapkan perubahan? [Apply] [Edit prompt] [Cancel]
```

Untuk plugin yang sudah ada, preview harus membedakan file baru dan file yang diubah.

## Error dan safety boundary

Authoring flow perlu berhenti sebelum menulis jika:

- tipe kontribusi tidak dikenali
- prompt tidak cukup menjelaskan target
- file target berada di luar workspace yang diizinkan
- perubahan akan menimpa plugin tanpa confirmation
- plugin identifier tidak valid
- kontribusi menghasilkan shortcut yang konflik
- hook meminta capability yang tidak diizinkan

Error authoring harus ditampilkan sebagai UI yang dapat dipahami user, bukan hanya exception mentah.

Hook yang menjalankan command atau mengakses filesystem tetap harus mengikuti permission boundary yang berlaku untuk tool dan plugin.

## Implementasi bertahap

### Tahap 1: command dan authoring flow

- Tambahkan local JSX command `/plugin-authoring`.
- Parse `create <type> <prompt>` dan `list`.
- Dukung prompt kosong melalui input interaktif.
- Tampilkan intent dan preview tanpa mengaktifkan runtime panel terlebih dahulu.

### Tahap 2: right panel slot

- Tambahkan optional `rightPanel` pada `FullscreenLayout`.
- Tambahkan `rightPanelOpen`, `rightPanelWidth`, dan close handler.
- Render split layout hanya pada fullscreen mode.
- Tambahkan fallback non-fullscreen.

### Tahap 3: provider dan registry

- Tambahkan `RightPanelProvider` dan `useRightPanel`.
- Tambahkan panel registry minimal.
- Tambahkan open/close/toggle dan active panel selection.

### Tahap 4: keyboard dan responsive behavior

- Tambahkan shortcut toggle.
- Tambahkan `Esc` untuk close.
- Tambahkan resize dengan keyboard.
- Tambahkan policy untuk terminal sempit.

### Tahap 5: contribution lain

- Tambahkan status-line registry.
- Tambahkan toast registry dan lifecycle.
- Tambahkan hook registry dan cleanup.
- Hubungkan `/plugin-authoring` dengan generator tiap contribution type.

### Tahap 6: hot reload

- Reload plugin setelah confirmation.
- Unregister kontribusi lama.
- Verifikasi cleanup resource.
- Refresh commands, agents, hooks, dan UI contributions secara konsisten.

## Ringkasan keputusan

```text
Command:
  /plugin-authoring create <type> <prompt bebas>
  /plugin-authoring list

Types:
  panel | status-line | toast | hook

Prompt:
  natural-language dan dapat multiline

Authoring:
  parse → clarify → generate → preview → confirm → apply → reload

Runtime:
  plugin loader → registry → REPL slots

Right panel:
  split panel pada fullscreen
  fallback non-fullscreen
  keyboard toggle dan resize
  close otomatis atau compact pada terminal sempit

Boundary:
  /plugin-authoring tidak mengelola layout langsung
  FullscreenLayout tidak memahami detail plugin tertentu
```
