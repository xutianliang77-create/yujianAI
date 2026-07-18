FROM golang:1.26.2-bookworm@sha256:47ce5636e9936b2c5cbf708925578ef386b4f8872aec74a67bd13a627d242b19

RUN sed -i \
      -e 's|deb.debian.org|mirrors.aliyun.com|g' \
      -e 's|security.debian.org|mirrors.aliyun.com/debian-security|g' \
      /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
      libopus-dev=1.3.1-3 \
      libopusfile-dev=0.12-4 \
      libsoxr-dev=0.1.3-4 \
      pkg-config=1.8.1-1 \
    && rm -rf /var/lib/apt/lists/*
