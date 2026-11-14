package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type mediaRequest struct {
	Operation string                 `json:"operation"`
	MediaType string                 `json:"mediaType"`
	FileName  string                 `json:"fileName"`
	DataURL   string                 `json:"dataUrl"`
	Mode      string                 `json:"mode"`
	Metadata  map[string]interface{} `json:"metadata"`
}

type mediaResponse struct {
	OK        bool                   `json:"ok"`
	Mode      string                 `json:"mode"`
	Operation string                 `json:"operation"`
	Message   string                 `json:"message"`
	FileName  string                 `json:"fileName"`
	Size      int                    `json:"size"`
	Output    string                 `json:"output,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

func handleMediaOperation(w http.ResponseWriter, r *http.Request, mediaType string, fallbackOperation string) {
	var req mediaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
		return
	}

	if strings.TrimSpace(req.Operation) == "" {
		req.Operation = fallbackOperation
	}
	if strings.TrimSpace(req.Mode) == "" {
		req.Mode = "server"
	}
	if strings.TrimSpace(req.MediaType) == "" {
		req.MediaType = mediaType
	}
	if strings.TrimSpace(req.FileName) == "" {
		req.FileName = fmt.Sprintf("processed-%s.bin", req.MediaType)
	}

	payloadSize := 0
	if req.DataURL != "" {
		payload := req.DataURL
		if idx := strings.Index(payload, ","); idx >= 0 {
			payload = payload[idx+1:]
		}
		if decoded, err := base64.StdEncoding.DecodeString(payload); err == nil {
			payloadSize = len(decoded)
		} else {
			payloadSize = len(payload)
		}
	}

	resp := mediaResponse{
		OK:        true,
		Mode:      req.Mode,
		Operation: req.Operation,
		Message:   fmt.Sprintf("%s accepted for %s processing on the %s pipeline.", req.Operation, req.MediaType, req.Mode),
		FileName:  req.FileName,
		Size:      payloadSize,
		Metadata:  req.Metadata,
	}
	if req.Mode == "server" {
		resp.Output = "server"
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}
