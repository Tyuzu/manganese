package httpx

import (
	stdhttp "net/http"

	"nae/internal/config"

	"github.com/julienschmidt/httprouter"
)

// NewRouter creates the media-editing API router.
func NewRouter(cfg config.Config) stdhttp.Handler {
	router := httprouter.New()

	router.GET("/api/v1/health", Health)
	router.POST("/api/v1/media/process", ProcessMedia)
	router.POST("/api/v1/image/process", ProcessImage)
	router.POST("/api/v1/video/process", ProcessVideo)
	router.POST("/api/v1/scan/process", ProcessScan)
	router.POST("/api/v1/pdf/process", ProcessPDF)

	return CORS(RateLimit(router))
}
