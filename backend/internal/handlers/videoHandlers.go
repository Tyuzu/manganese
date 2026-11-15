package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/julienschmidt/httprouter"
)

func HandleVideoProcess(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	handleMediaOperation(w, r, "video", "video-export")
}

func HandleVideoExport(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	handleMediaOperation(w, r, "video", "video-export")
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
