FROM golang:1.26.2-bookworm@sha256:47ce5636e9936b2c5cbf708925578ef386b4f8872aec74a67bd13a627d242b19 AS go

FROM livekit/gstreamer@sha256:57c24ac3e870adaf4dad0819293592fbc7d3cb1330c66ac206cecc5d23456628

COPY --from=go /usr/local/go /usr/local/go

ENV PATH="/usr/local/go/bin:${PATH}"
