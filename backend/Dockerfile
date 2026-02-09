# Stage 1: cargo-chef for dependency caching
FROM rust:1.86-bookworm AS chef
RUN cargo install cargo-chef
WORKDIR /app

# Stage 2: compute dependency recipe
FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

# Stage 3: build dependencies (cached) then build app
FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release

# Stage 4: minimal runtime image
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/gideon-tasks-api /usr/local/bin/
COPY --from=builder /app/migrations /app/migrations

WORKDIR /app
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["gideon-tasks-api"]
