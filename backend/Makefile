# Makefile for local Go + gRPC development
# Generate pb.go files using source_relative to avoid manual module options

MODULE = github.com/kaili-yang/structview-agent/backend
PROTO_DIR = proto
OUT_DIR = pkg/agentservice

all: clean generate build

# Clean old generated files
clean:
	@echo "Cleaning old generated files..."
	rm -rf $(OUT_DIR)/*.pb.go

# Generate Go and gRPC files
generate:
	@echo "Generating Go gRPC code from proto files..."
	protoc \
		--proto_path=$(PROTO_DIR) \
		--go_out=$(OUT_DIR) --go_opt=paths=source_relative \
		--go-grpc_out=$(OUT_DIR) --go-grpc_opt=paths=source_relative \
		$(PROTO_DIR)/*.proto
	@echo "✅ Generation complete!"

# Build the Go project
build:
	go mod tidy
	go build -o structView-agent-backend main.go

