package handlers

import (
	"net/http"

	"github.com/julienschmidt/httprouter"
)

// HandleScanProcess handles document scanning, image optimization, and scan export operations.
func HandleScanProcess(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	HandleMediaOperation(w, r, "scan", "scan-export")
}
