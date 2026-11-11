package auth

import (
	"encoding/json"
	"net/http"

	"nae/internal/domain"

	"github.com/julienschmidt/httprouter"
)

// Login authenticates the admin user.
func Login(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	var creds domain.Credentials
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	if creds.Username == "admin" && creds.Password == "secret" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"token":   "valid-jwt-token-xyz",
			"message": "Login successful",
		})
		return
	}

	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]string{"error": "Invalid username or password"})
}

// Register creates a user account.
func Register(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	var creds domain.Credentials
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "User registered successfully"})
}
