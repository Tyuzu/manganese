package httpx

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCORSAllowsBrowserPreflightForProtectedRequests(t *testing.T) {
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/media/process", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Access-Control-Request-Method", "PATCH")

	res := httptest.NewRecorder()

	CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for preflight, got %d", res.Code)
	}

	methods := res.Header().Get("Access-Control-Allow-Methods")
	if methods == "" || !strings.Contains(methods, "PATCH") {
		t.Fatalf("expected PATCH in Access-Control-Allow-Methods, got %q", methods)
	}

	if got := res.Header().Get("Access-Control-Allow-Origin"); got == "" {
		t.Fatal("expected Access-Control-Allow-Origin header")
	}
}
