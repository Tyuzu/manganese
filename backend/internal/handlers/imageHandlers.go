package handlers

import (
	"net/http"

	"github.com/julienschmidt/httprouter"
)

// HandleImageProcess handles image editing, manipulation, and export operations.
func HandleImageProcess(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	HandleMediaOperation(w, r, "image", "image-edit")
}
