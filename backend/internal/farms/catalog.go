package farms

import (
	"strings"

	"nae/internal/domain"
)

var cropCatalog = map[string][]domain.CropCatalogueItem{
	"grains": {
		{Name: "Wheat", Type: "grains", Description: "High-yield cereal grain used for flour and feed.", WaterRequirement: "Moderate"},
		{Name: "Rice", Type: "grains", Description: "Water-intensive staple grain grown in flooded paddies.", WaterRequirement: "High"},
		{Name: "Barley", Type: "grains", Description: "Cool-season cereal used in brewing and livestock feed.", WaterRequirement: "Moderate"},
	},
	"vegetables": {
		{Name: "Tomato", Type: "vegetables", Description: "Warm-season fruiting crop with diverse culinary use.", WaterRequirement: "Moderate"},
		{Name: "Carrot", Type: "vegetables", Description: "Root crop commonly grown for fresh-market and processing use.", WaterRequirement: "Moderate"},
		{Name: "Potato", Type: "vegetables", Description: "High-yield tuber crop with strong storage value.", WaterRequirement: "Moderate"},
	},
	"fruits": {
		{Name: "Apple", Type: "fruits", Description: "Temperate fruit crop with broad market demand.", WaterRequirement: "Moderate"},
		{Name: "Orange", Type: "fruits", Description: "Citrus fruit requiring warm climates and irrigation support.", WaterRequirement: "Moderate"},
		{Name: "Grape", Type: "fruits", Description: "Perennial vine crop used for fresh fruit and wine.", WaterRequirement: "Moderate"},
	},
	"legumes": {
		{Name: "Soybean", Type: "legumes", Description: "Protein-rich legume used for food, feed, and oils.", WaterRequirement: "Moderate"},
		{Name: "Lentil", Type: "legumes", Description: "Drought-tolerant pulse crop with high nutritional value.", WaterRequirement: "Low"},
		{Name: "Chickpea", Type: "legumes", Description: "Warm-season pulse crop suited to dryland production.", WaterRequirement: "Low"},
	},
}

func normalizeCropType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "grain", "grains", "cereal", "cereals":
		return "grains"
	case "vegetable", "vegetables", "veg", "veggies":
		return "vegetables"
	case "fruit", "fruits":
		return "fruits"
	case "legume", "legumes", "pulse", "pulses":
		return "legumes"
	default:
		return strings.ToLower(strings.TrimSpace(raw))
	}
}

func Catalog() map[string][]domain.CropCatalogueItem {
	result := make(map[string][]domain.CropCatalogueItem, len(cropCatalog))
	for key, items := range cropCatalog {
		cloned := make([]domain.CropCatalogueItem, len(items))
		copy(cloned, items)
		result[key] = cloned
	}
	return result
}

func CatalogByType(kind string) ([]domain.CropCatalogueItem, bool) {
	normalized := normalizeCropType(kind)
	items, ok := cropCatalog[normalized]
	if !ok {
		return nil, false
	}
	cloned := make([]domain.CropCatalogueItem, len(items))
	copy(cloned, items)
	return cloned, true
}
