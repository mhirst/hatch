package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/hatch/hatchd/internal/api"
	"github.com/hatch/hatchd/internal/docker"
	"github.com/hatch/hatchd/internal/store"
	"github.com/hatch/hatchd/internal/tailscale"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:4592", "address to listen on")
	dataDir := flag.String("data", defaultDataDir(), "data directory")
	flag.Parse()

	if err := os.MkdirAll(*dataDir, 0o755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}

	db, err := store.Open(filepath.Join(*dataDir, "hatch.db"))
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	dockerClient, err := docker.New()
	if err != nil {
		log.Printf("docker unavailable: %v (deploys will fail until Docker is running)", err)
	}

	ts := tailscale.New()

	srv := api.NewServer(db, dockerClient, ts)
	httpSrv := &http.Server{
		Addr:              *addr,
		Handler:           srv.Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("hatchd listening on http://%s", *addr)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(ctx)
}

func defaultDataDir() string {
	if dir, err := os.UserConfigDir(); err == nil {
		return filepath.Join(dir, "hatch")
	}
	return ".hatch"
}
