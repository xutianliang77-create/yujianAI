# iOS compatibility target (deferred)

Use official `LiveKit` iOS SDK pinned by `infra/upstream/livekit-versions.json`. The target must
exercise token → join → microphone publish → remote TrackSubscribed → reconnect across primary/
secondary endpoints. This harness is intentionally not built on Mac; Beelink/CI device evidence is
required before marking the matrix compatible.
