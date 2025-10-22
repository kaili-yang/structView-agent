package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"

	pb "github.com/kaili-yang/structView-agent/backend/pkg/agentservice"
	"google.golang.org/grpc"
)

// server is used to implement agentservice.AIServiceServer
type server struct {
	pb.UnimplementedAIServiceServer
	listenPort string
}

// Ping implements agentservice.AIServiceServer
func (s *server) Ping(ctx context.Context, req *pb.PingRequest) (*pb.PingResponse, error) {
	log.Printf("Received Ping from client: %s", req.GetMessage())
	return &pb.PingResponse{Reply: "Pong! Go Backend is online."}, nil
}

// ExtractFeatures is the core AI task (placeholder for now)
func (s *server) ExtractFeatures(ctx context.Context, req *pb.FeatureExtractRequest) (*pb.FeatureExtractResponse, error) {
	// Placeholder logic for Task AI-01
	return &pb.FeatureExtractResponse{
		ExtractedJson: "{\"status\": \"Not Implemented Yet\"}",
		ErrorMessage:  "",
	}, nil
}

// SaveExtractedRecord and GetExtractionHistory are placeholders for BK-02
func (s *server) SaveExtractedRecord(ctx context.Context, req *pb.ExtractedRecord) (*pb.Empty, error) {
	return &pb.Empty{}, nil
}

func (s *server) GetExtractionHistory(ctx context.Context, req *pb.Empty) (*pb.ExtractionHistoryResponse, error) {
	return &pb.ExtractionHistoryResponse{}, nil
}

func main() {
	// Task SEC-01: Load port from environment or default
	port := os.Getenv("GRPC_PORT")
	if port == "" {
		port = "50051" // Default port
	}
	addr := fmt.Sprintf(":%s", port)
	
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}
	
	s := grpc.NewServer()
	// Register the service implementation
	pb.RegisterAIServiceServer(s, &server{listenPort: port})
	
	log.Printf("Go gRPC server listening on %v", lis.Addr())
	
	// Start serving requests
	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
