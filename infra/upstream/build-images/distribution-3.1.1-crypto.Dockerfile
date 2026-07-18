ARG GOLANG_BASE=golang:1.25.12-alpine3.24@sha256:56961d79ea8129efddcc0b8643fd8a5416b4e6228cfd477e3fd61deb2672c587
ARG ALPINE_BASE=alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
FROM ${GOLANG_BASE} AS registry-builder

ARG GOPROXY=https://goproxy.cn,direct
ARG DISTRIBUTION_COMMIT=9a8d98b679740cd514aa7e7d84d23d442a5ef54c
ENV CGO_ENABLED=0 GOPROXY=${GOPROXY}
WORKDIR /src/distribution
COPY . ./
RUN test "$(go list -m)" = "github.com/distribution/distribution/v3" \
    && go mod edit -require=golang.org/x/crypto@v0.52.0 -require=golang.org/x/net@v0.55.0 \
    && go mod download \
    && go build -mod=mod -buildvcs=false -trimpath \
      -ldflags="-s -w -X github.com/distribution/distribution/v3/version.version=3.1.1-yujian.1 -X github.com/distribution/distribution/v3/version.revision=${DISTRIBUTION_COMMIT} -X github.com/distribution/distribution/v3/version.mainpkg=github.com/distribution/distribution/v3" \
      -o /out/registry ./cmd/registry \
    && /out/registry --version \
    && go version -m /out/registry

FROM ${ALPINE_BASE}

LABEL org.opencontainers.image.title="Yujian Distribution Registry 3.1.1 security candidate" \
      org.opencontainers.image.source="https://github.com/distribution/distribution" \
      org.opencontainers.image.revision="9a8d98b679740cd514aa7e7d84d23d442a5ef54c" \
      org.opencontainers.image.licenses="Apache-2.0" \
      ai.yujian.distribution.x-crypto="v0.52.0" \
      ai.yujian.distribution.x-net="v0.55.0" \
      ai.yujian.release.status="candidate-not-authorized"

RUN apk add --no-cache ca-certificates
COPY --chmod=0755 --from=registry-builder /out/registry /bin/registry
COPY --chmod=0644 --from=registry-builder /src/distribution/cmd/registry/config-dev.yml /etc/distribution/config.yml
COPY --chmod=0644 --from=registry-builder /src/distribution/LICENSE /licenses/distribution-Apache-2.0.txt
RUN chmod 0755 /etc/distribution /licenses
VOLUME ["/var/lib/registry"]
ENV OTEL_TRACES_EXPORTER=none
EXPOSE 5000
ENTRYPOINT ["registry"]
CMD ["serve", "/etc/distribution/config.yml"]
