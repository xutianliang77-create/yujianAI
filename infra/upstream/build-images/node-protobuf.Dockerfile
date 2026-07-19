FROM node:24.18.0-bookworm@sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059

RUN sed -i \
      -e 's|deb.debian.org|mirrors.aliyun.com|g' \
      -e 's|security.debian.org|mirrors.aliyun.com/debian-security|g' \
      /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
      libprotobuf-dev=3.21.12-3+deb12u1 \
      protobuf-compiler=3.21.12-3+deb12u1 \
    && rm -rf /var/lib/apt/lists/*
