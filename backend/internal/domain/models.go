package domain

// Credentials represents basic login credentials.
type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Farm represents a farm record returned by the API.
type Farm struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Crop   string   `json:"crop"`
	Crops  []string `json:"crops,omitempty"`
	Status string   `json:"status"`
}

// FarmInput is used for create and update requests.
type FarmInput struct {
	Name   string   `json:"name"`
	Crop   string   `json:"crop"`
	Crops  []string `json:"crops"`
	Status string   `json:"status"`
}

// CropInput carries a single crop to add or remove.
type CropInput struct {
	Name string `json:"name"`
}

// CropCatalogueItem describes a crop entry in the public catalogue.
type CropCatalogueItem struct {
	Name             string `json:"name"`
	Type             string `json:"type"`
	Description      string `json:"description"`
	WaterRequirement string `json:"waterRequirement"`
}
