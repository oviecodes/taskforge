# ---------- STAGE 1: Build ----------
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy dependency files first for better caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary with optimizations
RUN CGO_ENABLED=0 GOOS=linux go build \
    -a -installsuffix cgo \
    -ldflags="-w -s" \
    -o resize-image .

# Verify the binary was created
RUN ls -la /app/resize-image

# ---------- STAGE 2: Runtime ----------
FROM alpine:latest

# Add metadata
LABEL maintainer="oviecodes@gmail.com"
LABEL description="Image resizing service"

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copy binary from builder (with verification)
COPY --from=builder /app/resize-image /app/resize-image

# Verify binary exists and is executable
RUN ls -la /app/resize-image && chmod +x /app/resize-image

# Change ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port (adjust as needed)
EXPOSE 8080

# Health check (adjust endpoint as needed)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

ENTRYPOINT ["/app/resize-image"]