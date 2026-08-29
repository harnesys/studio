# 19. Artifacts и attachments

**Depends:** 05, 15  
**Sources:** RUNTIME Attachments + Artifacts; Harnyx foldAttachments

## Fold в окно модели

Как Harnyx `foldAttachments`:

| kind | В окно модели |
|---|---|
| images / audio / video | bytes → multimodal parts (нужен reader) |
| files (kind:file) | в текст только имя + path/URI; bytes не кладём; модель читает tool'ами |

## SendFile

```ts
type SendFile =
  | { path: string; name?: string; mediaType? }
  | { bytes: Uint8Array; name?: string; mediaType? }
```

`path` → `ArtifactStore.read` / порт read (не сырой fs в ядре).

## ArtifactStore

```ts
createRuntime({ artifacts })

// порт
put(input) → { uri, … }
read(uri | path) → { bytes, mediaType }
// head / delete — позже
```

Адаптеры: `FsArtifactStore({ root })`, `S3ArtifactStore({ bucket, prefix, … })`, `MemoryArtifactStore()` (тесты).

RuntimeState/events держат uri/path, не blob. Большой файл: `put` → `send({ files: [{ path: uri }] })`.

## Out of scope

Session SendInput API surface (20), конкретный S3 SDK.
