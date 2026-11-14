package handlers

import (
	"net/http"

	"github.com/julienschmidt/httprouter"
)

func HandleVideoProcess(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	handleMediaOperation(w, r, "video", "video-export")
}
