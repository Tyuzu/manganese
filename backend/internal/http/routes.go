package httpx

import (
	stdhttp "net/http"

	"nae/internal/auth"
	"nae/internal/config"
	"nae/internal/farms"

	"github.com/julienschmidt/httprouter"
)

// NewRouter creates the app router with routes and middleware.
func NewRouter(cfg config.Config) stdhttp.Handler {
	router := httprouter.New()

	router.POST("/api/v1/login", auth.Login)
	router.POST("/api/v1/register", auth.Register)

	router.GET("/api/v1/farms", Auth(cfg.Token)(farms.ListFarms))
	router.POST("/api/v1/farms", Auth(cfg.Token)(farms.CreateFarm))
	router.GET("/api/v1/farms/:farmID", Auth(cfg.Token)(farms.GetFarm))
	router.PUT("/api/v1/farms/:farmID", Auth(cfg.Token)(farms.UpdateFarm))
	router.DELETE("/api/v1/farms/:farmID", Auth(cfg.Token)(farms.DeleteFarm))
	router.POST("/api/v1/farms/:farmID/crops", Auth(cfg.Token)(farms.AddCrop))
	router.DELETE("/api/v1/farms/:farmID/crops/:cropName", Auth(cfg.Token)(farms.RemoveCrop))
	router.GET("/api/v1/crops", Auth(cfg.Token)(farms.ListCropCatalogue))
	router.GET("/api/v1/crops/:cropType", Auth(cfg.Token)(farms.GetCropCatalogue))

	return CORS(RateLimit(router))
}
