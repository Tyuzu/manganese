package handlers

import (
	"net/http"

	"github.com/julienschmidt/httprouter"
)

func HandleScanProcess(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	handleMediaOperation(w, r, "scan", "scan-export")
}
