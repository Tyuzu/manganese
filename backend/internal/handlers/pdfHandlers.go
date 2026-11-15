package handlers

import (
	"net/http"

	"github.com/julienschmidt/httprouter"
)

// HandlePDFProcess handles PDF document generation, conversion, and export operations.
func HandlePDFProcess(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	HandleMediaOperation(w, r, "pdf", "pdf-export")
}
