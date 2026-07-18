ARG GOLANG_BASE=golang:1.25.12-alpine3.24@sha256:56961d79ea8129efddcc0b8643fd8a5416b4e6228cfd477e3fd61deb2672c587
ARG OPENBAO_BASE=openbao/openbao:2.5.4@sha256:436eaf9778cad75507ff70ea26ace30dcbe15606e619ac3823495663d7f7c115
FROM ${GOLANG_BASE} AS bao-builder

ARG GOPROXY=https://goproxy.cn,direct
ARG OPENBAO_COMMIT=4f6d47246a053375271a5fd8af85c3b75695aa46
ARG OPENBAO_VERSION=2.5.4-yujian.2
ARG OPENBAO_BUILD_DATE=2026-07-18T00:00:00Z
ENV CGO_ENABLED=0 GOPROXY=${GOPROXY}
WORKDIR /src/openbao
COPY . ./
RUN go mod edit -require=golang.org/x/crypto@v0.52.0 -require=golang.org/x/net@v0.55.0 \
    && cd sdk \
    && go mod edit -require=golang.org/x/crypto@v0.52.0 -require=golang.org/x/net@v0.55.0
RUN go mod download \
    && go build -mod=mod -buildvcs=false -trimpath -tags=ui \
      -ldflags="-s -w -X github.com/openbao/openbao/version.fullVersion=${OPENBAO_VERSION} -X github.com/openbao/openbao/version.GitCommit=${OPENBAO_COMMIT} -X github.com/openbao/openbao/version.BuildDate=${OPENBAO_BUILD_DATE}" \
      -o /out/bao . \
    && /out/bao version \
    && go version -m /out/bao

FROM ${OPENBAO_BASE}

USER root
LABEL org.opencontainers.image.title="Yujian OpenBao 2.5.4 security candidate" \
      org.opencontainers.image.base.name="openbao/openbao:2.5.4" \
      org.opencontainers.image.source="https://github.com/openbao/openbao" \
      org.opencontainers.image.revision="4f6d47246a053375271a5fd8af85c3b75695aa46" \
      org.opencontainers.image.licenses="MPL-2.0" \
      ai.yujian.openbao.x-crypto="v0.52.0" \
      ai.yujian.openbao.x-net="v0.55.0" \
      ai.yujian.source.offer="infra/upstream/OPENBAO_SOURCE_OFFER.md" \
      ai.yujian.release.status="candidate-not-authorized"

COPY --from=bao-builder /out/bao /bin/bao
COPY --from=bao-builder /src/openbao/LICENSE /licenses/openbao-MPL-2.0.txt
COPY --from=bao-builder /src/openbao/LICENSE_DEPENDENCIES.md /licenses/openbao-dependencies.md
RUN apk add --no-cache --upgrade libcrypto3=3.5.7-r0 libssl3=3.5.7-r0 \
    && bao version \
    && apk info -v | grep -E '^(libcrypto3|libssl3)-3[.]5[.]7-r0$'
