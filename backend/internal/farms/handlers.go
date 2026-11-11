package farms

import (
	"encoding/json"
	"net/http"
	"strings"

	"nae/internal/domain"

	"github.com/julienschmidt/httprouter"
)

func ListFarms(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(store.List())
}

func CreateFarm(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	var input domain.FarmInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	farm, err := store.Create(input)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(farm)
}

func GetFarm(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	farmID := ps.ByName("farmID")
	farm, exists := store.Get(farmID)
	w.Header().Set("Content-Type", "application/json")

	if !exists {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Farm not found"})
		return
	}

	json.NewEncoder(w).Encode(farm)
}

func UpdateFarm(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	farmID := ps.ByName("farmID")

	var input domain.FarmInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	farm, exists, err := store.Update(farmID, input)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Farm not found"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(farm)
}

func DeleteFarm(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	farmID := ps.ByName("farmID")
	if !store.Delete(farmID) {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Farm not found"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func AddCrop(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	farmID := ps.ByName("farmID")

	var input domain.CropInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request payload"})
		return
	}

	farm, exists, err := store.AddCrop(farmID, input.Name)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Farm not found"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(farm)
}

func RemoveCrop(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	farmID := ps.ByName("farmID")
	cropName := ps.ByName("cropName")

	farm, exists, err := store.RemoveCrop(farmID, cropName)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Farm not found"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(farm)
}

func ListCropCatalogue(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	cropType := strings.TrimSpace(r.URL.Query().Get("type"))
	w.Header().Set("Content-Type", "application/json")

	if cropType == "" {
		json.NewEncoder(w).Encode(Catalog())
		return
	}

	items, ok := CatalogByType(cropType)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Crop type not found"})
		return
	}

	json.NewEncoder(w).Encode(items)
}

func GetCropCatalogue(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	cropType := ps.ByName("cropType")
	items, ok := CatalogByType(cropType)
	w.Header().Set("Content-Type", "application/json")

	if !ok {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Crop type not found"})
		return
	}

	json.NewEncoder(w).Encode(items)
}
