package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/julienschmidt/httprouter"
)

// writeJSON is a helper to write JSON responses consistently and cleanly.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// HandleVideoProcess handles video processing operations.
func HandleVideoProcess(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	HandleMediaOperation(w, r, "video", "video-export")
}

// HandleVideoExport handles direct video export requests.
func HandleVideoExport(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	HandleMediaOperation(w, r, "video", "video-export")
}

// HandleVideoExportStatus checks the progress of an asynchronous export job.
// Supports both httprouter path parameters (/status/:jobId) and query parameters (?jobId=...).
func HandleVideoExportStatus(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	jobID := ps.ByName("jobId")
	if jobID == "" {
		jobID = r.URL.Query().Get("jobId")
	}

	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing jobId"})
		return
	}

	job, ok := getExportJobStatus(jobID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
		return
	}

	response := map[string]interface{}{
		"ok":       true,
		"jobId":    job.ID,
		"status":   job.Status,
		"message":  job.Message,
		"fileName": job.FileName,
		"progress": job.Progress,
	}
	if job.Output != "" {
		response["output"] = job.Output
	}
	if job.Error != "" {
		response["error"] = job.Error
	}

	writeJSON(w, http.StatusOK, response)
}

// HandleVideoDownload handles downloading rendered export files.
// Supports both httprouter path parameters (/download/*path) and query parameters (?path=...).
func HandleVideoDownload(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	pathValue := ps.ByName("path")
	if pathValue == "" {
		pathValue = r.URL.Query().Get("path")
	}

	pathValue = strings.TrimSpace(pathValue)
	if pathValue == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing path"})
		return
	}

	serveExportFile(w, r, pathValue)
}
