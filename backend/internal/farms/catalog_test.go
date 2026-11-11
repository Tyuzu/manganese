package farms_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"nae/internal/config"
	httpx "nae/internal/http"
)

func TestCropCatalogueByType(t *testing.T) {
	router := httpx.NewRouter(config.Config{Token: "valid-jwt-token-xyz"})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/crops?type=grains", nil)
	req.Header.Set("Authorization", "Bearer valid-jwt-token-xyz")
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200 from crop catalogue, got %d: %s", res.Code, res.Body.String())
	}

	var crops []map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &crops); err != nil {
		t.Fatalf("failed to decode crop catalogue payload: %v", err)
	}

	if len(crops) == 0 {
		t.Fatal("expected at least one crop in the grains catalogue")
	}
}
