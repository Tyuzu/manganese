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

	// Unified Media Operations
	router.POST("/api/v1/media/process", ProcessMedia)

	// Image, Scan, PDF Endpoints
	router.POST("/api/v1/image/process", handlers.HandleImageProcess)
	router.POST("/api/v1/scan/process", handlers.HandleScanProcess)
	router.POST("/api/v1/pdf/process", handlers.HandlePDFProcess)

	// Video Endpoints (supporting both /api/video and /api/v1/video prefixes)
	router.POST("/api/v1/video/process", handlers.HandleVideoProcess)
	router.POST("/api/video/process", handlers.HandleVideoProcess)

	router.POST("/api/v1/video/export", handlers.HandleVideoExport)
	router.POST("/api/video/export", handlers.HandleVideoExport)

	router.GET("/api/v1/video/export/status", handlers.HandleVideoExportStatus)
	router.GET("/api/video/export/status", handlers.HandleVideoExportStatus)
	router.GET("/api/v1/video/status", handlers.HandleVideoExportStatus)
	router.GET("/api/video/status", handlers.HandleVideoExportStatus)

	router.GET("/api/v1/video/download", handlers.HandleVideoDownload)
	router.GET("/api/video/download", handlers.HandleVideoDownload)

	return CORS(RateLimit(router))
}
