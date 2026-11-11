package app

import (
	"fmt"
	stdhttp "net/http"

	"nae/internal/config"
	apihttp "nae/internal/http"
)

// Start boots the HTTP server.
func Start(cfg config.Config) error {
	addr := ":" + cfg.Port
	fmt.Printf("Server running at http://%s:%s\n", cfg.Host, cfg.Port)
	return stdhttp.ListenAndServe(addr, apihttp.NewRouter(cfg))
}
