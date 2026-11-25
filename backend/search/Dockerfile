# syntax=docker/dockerfile:1.7
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS build
ARG TARGETOS TARGETARCH
WORKDIR /src
COPY search/go.mod search/go.sum ./
RUN go mod download
COPY search/ ./
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/search .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/search /search
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/search"]
