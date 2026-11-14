package handlers

import (
	"net/http"

	"github.com/julienschmidt/httprouter"
)

func HandlePDFProcess(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	handleMediaOperation(w, r, "pdf", "pdf-export")
}
