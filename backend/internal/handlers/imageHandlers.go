package handlers

import (
	"net/http"

	"github.com/julienschmidt/httprouter"
)

func HandleImageProcess(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	handleMediaOperation(w, r, "image", "image-edit")
}
