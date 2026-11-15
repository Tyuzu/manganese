package httpx

import (
	stdhttp "net/http"

	"nae/internal/config"
	"nae/internal/handlers"

	"github.com/julienschmidt/httprouter"
)

// NewRouter creates the media-editing API router.
func NewRouter(cfg config.Config) stdhttp.Handler {
	router := httprouter.New()

	router.GET("/api/v1/health", Health)
	router.POST("/api/v1/media/process", ProcessMedia)
	router.POST("/api/v1/image/process", handlers.HandleImageProcess)
	router.POST("/api/v1/video/process", handlers.HandleVideoProcess)
	router.POST("/api/v1/video/export", handlers.HandleVideoExport)
	router.GET("/api/v1/video/export/status", handlers.HandleVideoExportStatus)
	router.GET("/api/v1/video/download", handlers.HandleVideoDownload)
	router.POST("/api/v1/scan/process", handlers.HandleScanProcess)
	router.POST("/api/v1/pdf/process", handlers.HandlePDFProcess)

	return CORS(RateLimit(router))
}
