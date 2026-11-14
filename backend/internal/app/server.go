package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"nae/internal/config"
	apihttp "nae/internal/http"
)

// Start boots the HTTP server and shuts it down gracefully on termination signals.
func Start(cfg config.Config) error {
	addr := fmt.Sprintf("%s:%s", cfg.Host, cfg.Port)
	router := apihttp.NewRouter(cfg)

	srv := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdownCh := make(chan os.Signal, 1)
	signal.Notify(shutdownCh, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-shutdownCh
		log.Println("received shutdown signal, stopping server")

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("server shutdown error: %v", err)
		}
	}()

	fmt.Printf("Server running at http://%s\n", addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return nil
}
