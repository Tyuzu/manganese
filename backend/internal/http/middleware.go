package httpx

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/julienschmidt/httprouter"
)

type visitor struct {
	lastSeen time.Time
	tokens   int
}

var (
	visitors = make(map[string]*visitor)
	mu       sync.Mutex
)

// RateLimit limits the number of requests per client IP.
func RateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr

		mu.Lock()
		v, exists := visitors[ip]
		if !exists {
			visitors[ip] = &visitor{lastSeen: time.Now(), tokens: 10}
			v = visitors[ip]
		}
		v.lastSeen = time.Now()

		if v.tokens <= 0 {
			mu.Unlock()
			http.Error(w, `{"error":"Too many requests"}`, http.StatusTooManyRequests)
			return
		}
		v.tokens--
		mu.Unlock()

		next.ServeHTTP(w, r)
	})
}

// CORS adds the CORS headers required by the frontend.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Auth validates the bearer token for protected routes.
func Auth(token string) func(httprouter.Handle) httprouter.Handle {
	return func(next httprouter.Handle) httprouter.Handle {
		return func(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "Unauthorized: Missing token"})
				return
			}

			providedToken := strings.TrimPrefix(authHeader, "Bearer ")
			if providedToken != token {
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "Unauthorized: Invalid token"})
				return
			}

			next(w, r, ps)
		}
	}
}
