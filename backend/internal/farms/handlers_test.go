package farms_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"nae/internal/config"
	httpx "nae/internal/http"
)

func TestFarmCRUDAndCropLifecycle(t *testing.T) {
	router := httpx.NewRouter(config.Config{Token: "valid-jwt-token-xyz"})

	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/farms", strings.NewReader(`{"name":"Alpha Farm","crop":"Wheat","status":"Healthy"}`))
	createReq.Header.Set("Authorization", "Bearer valid-jwt-token-xyz")
	createRes := httptest.NewRecorder()
	router.ServeHTTP(createRes, createReq)

	if createRes.Code != http.StatusCreated {
		t.Fatalf("expected 201 from farm creation, got %d: %s", createRes.Code, createRes.Body.String())
	}

	var created map[string]any
	if err := json.Unmarshal(createRes.Body.Bytes(), &created); err != nil {
		t.Fatalf("failed to decode created farm: %v", err)
	}

	farmID, ok := created["id"].(string)
	if !ok || farmID == "" {
		t.Fatalf("expected created farm id in response, got %#v", created)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/farms", nil)
	listReq.Header.Set("Authorization", "Bearer valid-jwt-token-xyz")
	listRes := httptest.NewRecorder()
	router.ServeHTTP(listRes, listReq)

	if listRes.Code != http.StatusOK {
		t.Fatalf("expected 200 from farm list, got %d: %s", listRes.Code, listRes.Body.String())
	}

	cropReq := httptest.NewRequest(http.MethodPost, "/api/v1/farms/"+farmID+"/crops", strings.NewReader(`{"name":"Corn"}`))
	cropReq.Header.Set("Authorization", "Bearer valid-jwt-token-xyz")
	cropRes := httptest.NewRecorder()
	router.ServeHTTP(cropRes, cropReq)

	if cropRes.Code != http.StatusOK {
		t.Fatalf("expected 200 from crop add, got %d: %s", cropRes.Code, cropRes.Body.String())
	}

	updateReq := httptest.NewRequest(http.MethodPut, "/api/v1/farms/"+farmID, strings.NewReader(`{"name":"Alpha Farm Updated","crop":"Rice","status":"Needs Water"}`))
	updateReq.Header.Set("Authorization", "Bearer valid-jwt-token-xyz")
	updateRes := httptest.NewRecorder()
	router.ServeHTTP(updateRes, updateReq)

	if updateRes.Code != http.StatusOK {
		t.Fatalf("expected 200 from farm update, got %d: %s", updateRes.Code, updateRes.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/farms/"+farmID, nil)
	getReq.Header.Set("Authorization", "Bearer valid-jwt-token-xyz")
	getRes := httptest.NewRecorder()
	router.ServeHTTP(getRes, getReq)

	if getRes.Code != http.StatusOK {
		t.Fatalf("expected 200 from farm fetch, got %d: %s", getRes.Code, getRes.Body.String())
	}

	var farm map[string]any
	if err := json.Unmarshal(getRes.Body.Bytes(), &farm); err != nil {
		t.Fatalf("failed to decode fetched farm: %v", err)
	}

	if farm["name"] != "Alpha Farm Updated" {
		t.Fatalf("expected updated farm name, got %#v", farm)
	}

	if crops, ok := farm["crops"].([]any); !ok || len(crops) == 0 {
		t.Fatalf("expected farm crops to be present, got %#v", farm)
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/v1/farms/"+farmID, nil)
	deleteReq.Header.Set("Authorization", "Bearer valid-jwt-token-xyz")
	deleteRes := httptest.NewRecorder()
	router.ServeHTTP(deleteRes, deleteReq)

	if deleteRes.Code != http.StatusNoContent {
		t.Fatalf("expected 204 from farm delete, got %d: %s", deleteRes.Code, deleteRes.Body.String())
	}
}
