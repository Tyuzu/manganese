package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
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
	Size      int64                  `json:"size"`
	Output    string                 `json:"output,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	Status    string                 `json:"status,omitempty"`
	JobID     string                 `json:"jobId,omitempty"`
	Progress  float64                `json:"progress,omitempty"`
	Error     string                 `json:"error,omitempty"`
}

type exportJob struct {
	mu        sync.RWMutex
	ID        string    `json:"id"`
	Status    string    `json:"status"`
	Message   string    `json:"message"`
	FileName  string    `json:"fileName"`
	Output    string    `json:"output,omitempty"`
	Progress  float64   `json:"progress"`
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (j *exportJob) update(status, message, output, errStr string, progress float64) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = status
	j.Message = message
	if output != "" {
		j.Output = output
	}
	if errStr != "" {
		j.Error = errStr
	}
	j.Progress = progress
	j.UpdatedAt = time.Now()
}

func (j *exportJob) snapshot() exportJob {
	j.mu.RLock()
	defer j.mu.RUnlock()
	return exportJob{
		ID:        j.ID,
		Status:    j.Status,
		Message:   j.Message,
		FileName:  j.FileName,
		Output:    j.Output,
		Progress:  j.Progress,
		Error:     j.Error,
		CreatedAt: j.CreatedAt,
		UpdatedAt: j.UpdatedAt,
	}
}

var exportJobs sync.Map

// writeJSON is a helper to write JSON responses consistently and cleanly.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func decodeDataURL(dataURL string) ([]byte, error) {
	trimmed := strings.TrimSpace(dataURL)
	if trimmed == "" {
		return nil, fmt.Errorf("empty data URL")
	}

	payload := trimmed
	if idx := strings.Index(payload, ","); idx >= 0 {
		payload = payload[idx+1:]
	}
	if strings.TrimSpace(payload) == "" {
		return nil, fmt.Errorf("encoded payload is empty")
	}

	if decoded, err := base64.StdEncoding.DecodeString(payload); err == nil {
		return decoded, nil
	}
	return base64.RawStdEncoding.DecodeString(payload)
}

func ensureExportDirectory() string {
	exportDir := filepath.Join(os.TempDir(), "dolomite-exports")
	if err := os.MkdirAll(exportDir, 0o755); err != nil {
		return os.TempDir()
	}
	return exportDir
}

func safeExportName(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		trimmed = "dolomite-export.bin"
	}
	trimmed = strings.NewReplacer("/", "-", "\\", "-").Replace(trimmed)
	trimmed = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			return r
		}
		return '-'
	}, trimmed)
	return trimmed
}

func metadataFloat(metadata map[string]interface{}, key string) float64 {
	if metadata == nil {
		return 0
	}
	value, found := metadata[key]
	if !found || value == nil {
		return 0
	}

	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int32:
		return float64(typed)
	case int64:
		return float64(typed)
	case string:
		if parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64); err == nil {
			return parsed
		}
	}
	return 0
}

func metadataBool(metadata map[string]interface{}, key string) bool {
	if metadata == nil {
		return false
	}
	value, found := metadata[key]
	if !found || value == nil {
		return false
	}

	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		t := strings.TrimSpace(typed)
		return strings.EqualFold(t, "true") || strings.EqualFold(t, "1")
	case float64:
		return typed != 0
	case int:
		return typed != 0
	}
	return false
}

func metadataMap(metadata map[string]interface{}, key string) map[string]interface{} {
	if metadata == nil {
		return nil
	}
	value, found := metadata[key]
	if !found || value == nil {
		return nil
	}
	parsed, ok := value.(map[string]interface{})
	if !ok {
		return nil
	}
	return parsed
}

func normalizeExportExtension(name string, metadata map[string]interface{}, defaultExt string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		trimmed = "dolomite-export" + defaultExt
	}

	ext := filepath.Ext(trimmed)
	if ext == "" {
		ext = defaultExt
	}
	if formatValue, ok := metadata["format"].(string); ok {
		requested := strings.ToLower(strings.TrimSpace(formatValue))
		if requested != "" {
			ext = "." + requested
		}
	}

	base := strings.TrimSuffix(trimmed, filepath.Ext(trimmed))
	return base + ext
}

func serveExportFile(w http.ResponseWriter, r *http.Request, filePath string) {
	cleanPath := filepath.Clean(filePath)
	if strings.TrimSpace(filePath) == "" || !strings.HasPrefix(cleanPath, filepath.Clean(os.TempDir())) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid or missing export file path"})
		return
	}

	fileInfo, err := os.Stat(cleanPath)
	if err != nil || fileInfo.IsDir() {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "exported file not found"})
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filepath.Base(cleanPath)))
	http.ServeFile(w, r, cleanPath)
}

func queueVideoExport(req mediaRequest) (mediaResponse, error) {
	if strings.TrimSpace(req.DataURL) == "" {
		return mediaResponse{}, fmt.Errorf("missing source video payload")
	}

	jobID := fmt.Sprintf("video-%d", time.Now().UnixNano())
	job := &exportJob{
		ID:        jobID,
		Status:    "queued",
		Message:   "Video export queued on the server.",
		FileName:  strings.TrimSpace(req.FileName),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if job.FileName == "" {
		job.FileName = "dolomite-rendered.mp4"
	}
	exportJobs.Store(jobID, job)

	// Launch background processing and pass the job pointer for progress updates
	go func() {
		job.update("processing", "Rendering video on the server…", "", "", 5)

		result, err := processVideoExportWithProgress(job, req)
		if err != nil {
			job.update("failed", err.Error(), "", err.Error(), 0)
			return
		}

		job.update("completed", result.Message, result.Output, "", 100)
	}()

	snap := job.snapshot()
	return mediaResponse{
		OK:        true,
		Mode:      req.Mode,
		Operation: req.Operation,
		Message:   "Video export queued on the server.",
		FileName:  snap.FileName,
		Status:    snap.Status,
		JobID:     jobID,
		Progress:  snap.Progress,
		Metadata:  req.Metadata,
	}, nil
}

func HandleMediaOperation(w http.ResponseWriter, r *http.Request, mediaType string, fallbackOperation string) {
	var req mediaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
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

	// Route to video exporter if applicable
	if req.MediaType == "video" && (req.Operation == "video-export" || req.Operation == "video-process") {
		if req.Mode == "server" && metadataBool(req.Metadata, "async") {
			result, err := queueVideoExport(req)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, result)
			return
		}

		result, err := processVideoExportWithProgress(&exportJob{ID: "sync"}, req)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, result)
		return
	}

	writeJSON(w, http.StatusOK, mediaResponse{
		OK:        true,
		Mode:      req.Mode,
		Operation: req.Operation,
		Message:   fmt.Sprintf("Operation %s accepted for %s.", req.Operation, req.MediaType),
		FileName:  req.FileName,
		Metadata:  req.Metadata,
	})
}
