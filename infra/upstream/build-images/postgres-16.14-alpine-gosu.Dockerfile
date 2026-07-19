ARG GOLANG_BASE=golang:1.25.12-alpine3.24@sha256:56961d79ea8129efddcc0b8643fd8a5416b4e6228cfd477e3fd61deb2672c587
ARG POSTGRES_BASE=postgres:16.14-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777
FROM ${GOLANG_BASE} AS gosu-builder

ARG GOPROXY=https://goproxy.cn,direct
ENV CGO_ENABLED=0 GOPROXY=${GOPROXY}
WORKDIR /src/gosu
COPY go.mod go.sum ./
RUN go mod download
COPY *.go LICENSE ./
RUN go build -buildvcs=false -trimpath -ldflags='-d -w' -o /out/gosu . \
    && /out/gosu --version \
    && go version -m /out/gosu

FROM ${POSTGRES_BASE}

LABEL org.opencontainers.image.title="Yujian PostgreSQL 16.14 security candidate" \
      org.opencontainers.image.base.name="postgres:16.14-alpine" \
      org.opencontainers.image.source="https://github.com/tianon/gosu" \
      org.opencontainers.image.revision="6456aaa0f3c854d199d0f037f068eb97515b7513" \
      org.opencontainers.image.licenses="PostgreSQL AND Apache-2.0" \
      ai.yujian.release.status="candidate-not-authorized"

COPY --from=gosu-builder /out/gosu /usr/local/bin/gosu
COPY --from=gosu-builder /src/gosu/LICENSE /licenses/gosu-Apache-2.0.txt
COPY --from=yujian-licenses /postgresql-16.14-COPYRIGHT.txt /licenses/postgresql-COPYRIGHT.txt
RUN gosu --version \
    && test "$(gosu postgres id -u)" = "$(id -u postgres)"
