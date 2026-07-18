FROM golang:1.26.2-bookworm@sha256:47ce5636e9936b2c5cbf708925578ef386b4f8872aec74a67bd13a627d242b19 AS go

FROM livekit/gstreamer@sha256:f7d6ea2f09738481355aecd31948092e14e9aa0cb04e9e308e07fd8e4a645ecb

COPY --from=go /usr/local/go /usr/local/go

ENV PATH="/usr/local/go/bin:${PATH}"
