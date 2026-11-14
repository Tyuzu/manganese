package httpx

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/julienschmidt/httprouter"
)

type mediaProcessRequest struct {
	Operation string                 `json:"operation"`
	MediaType string                 `json:"mediaType"`
	FileName  string                 `json:"fileName"`
	DataURL   string                 `json:"dataUrl"`
	Mode      string                 `json:"mode"`
	Metadata  map[string]interface{} `json:"metadata"`
}

type mediaProcessResponse struct {
	OK        bool                   `json:"ok"`
	Mode      string                 `json:"mode"`
	Operation string                 `json:"operation"`
	Message   string                 `json:"message"`
	FileName  string                 `json:"fileName"`
	Size      int                    `json:"size"`
	Output    string                 `json:"output,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

func Health(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": "dolomite-media-server",
	})
}

func ProcessMedia(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	processMedia(w, r, "media")
}

func ProcessImage(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	processMedia(w, r, "image")
}

func ProcessVideo(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	processMedia(w, r, "video")
}

func ProcessScan(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	processMedia(w, r, "scan")
}

func ProcessPDF(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	processMedia(w, r, "pdf")
}

func processMedia(w http.ResponseWriter, r *http.Request, mediaType string) {
	var req mediaProcessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
		return
	}

	if strings.TrimSpace(req.Operation) == "" {
		req.Operation = "process"
	}
	if strings.TrimSpace(req.Mode) == "" {
		req.Mode = "server"
	}
	if strings.TrimSpace(req.MediaType) == "" {
		req.MediaType = mediaType
	}
	if strings.TrimSpace(req.FileName) == "" {
		req.FileName = fmt.Sprintf("processed-%s.bin", mediaType)
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

	response := mediaProcessResponse{
		OK:        true,
		Mode:      req.Mode,
		Operation: req.Operation,
		Message:   fmt.Sprintf("%s request accepted for %s processing on the %s pipeline.", req.Operation, req.MediaType, req.Mode),
		FileName:  req.FileName,
		Size:      payloadSize,
		Metadata:  req.Metadata,
	}
	if req.Mode == "server" {
		response.Output = "server"
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(response)
}
