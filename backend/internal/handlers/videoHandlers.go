package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/julienschmidt/httprouter"
)

func HandleVideoProcess(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	handleMediaOperation(w, r, "video", "video-export")
}

func HandleVideoExport(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	handleMediaOperation(w, r, "video", "video-export")
}

func HandleVideoExportStatus(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	jobID := r.URL.Query().Get("jobId")
	if strings.TrimSpace(jobID) == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "missing jobId"})
		return
	}

	job, ok := getExportJobStatus(jobID)
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "job not found"})
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

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(response)
}

func HandleVideoDownload(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	pathValue := r.URL.Query().Get("path")
	if pathValue == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "missing path"})
		return
	}

	serveExportFile(w, r, pathValue)
}
