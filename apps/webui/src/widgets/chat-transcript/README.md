# chat-transcript

Thread feed: runs, turn segments, tool detail, activity rail.

**API:** `ChatTranscript`, `ThreadPanel` (props: `threadId`, `agent`, `active`), `SpawnView`.  
**Feed model:** derived incrementally at ingest by `entities/session` (`model/feed/*`): runs, segments, tool pairs, spawns, maps. Components subscribe to fine-grained slices (`useThreadFeed`, `useFeedSpawn`, `useFeedMap`) — no render-time folding over raw events.  
**Parse tool output:** `model/tool-output.ts` (orchestrator) + `tool-detail-types`, `tool-json`, `tool-output-diff|file|shell`.  
**Live text:** `model/stream-text.ts` throttles streamed markdown re-parse (~100 ms); sealed segments render from the feed model.
