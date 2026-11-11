package farms

import (
	"fmt"
	"sort"
	"strings"
	"sync"

	"nae/internal/domain"
)

type Store struct {
	mu     sync.RWMutex
	farms  map[string]domain.Farm
	nextID int
}

var store = &Store{
	farms:  make(map[string]domain.Farm),
	nextID: 1,
}

func init() {
	seedDefaults()
}

func seedDefaults() {
	store.farms["1"] = domain.Farm{
		ID:     "1",
		Name:   "Green Valley Farm",
		Crop:   "Wheat",
		Status: "Healthy",
		Crops:  []string{"Wheat"},
	}
	store.farms["2"] = domain.Farm{
		ID:     "2",
		Name:   "Sunny Acres",
		Crop:   "Corn",
		Status: "Requires Irrigation",
		Crops:  []string{"Corn"},
	}
	store.nextID = 3
}

func normalizeCrops(primary string, extras []string) []string {
	seen := make(map[string]bool)
	ordered := make([]string, 0, len(extras)+1)

	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		key := strings.ToLower(value)
		if seen[key] {
			return
		}
		seen[key] = true
		ordered = append(ordered, value)
	}

	if primary != "" {
		add(primary)
	}
	for _, crop := range extras {
		add(crop)
	}

	if len(ordered) == 0 {
		return nil
	}

	sort.Strings(ordered)
	return ordered
}

func (s *Store) List() []domain.Farm {
	s.mu.RLock()
	defer s.mu.RUnlock()

	farms := make([]domain.Farm, 0, len(s.farms))
	for _, farm := range s.farms {
		farms = append(farms, farm)
	}
	sort.Slice(farms, func(i, j int) bool { return farms[i].ID < farms[j].ID })
	return farms
}

func (s *Store) Get(id string) (domain.Farm, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	farm, ok := s.farms[id]
	return farm, ok
}

func (s *Store) Create(input domain.FarmInput) (domain.Farm, error) {
	if strings.TrimSpace(input.Name) == "" {
		return domain.Farm{}, fmt.Errorf("farm name is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	farmID := fmt.Sprintf("%d", s.nextID)
	s.nextID++

	farm := domain.Farm{
		ID:     farmID,
		Name:   input.Name,
		Status: input.Status,
		Crops:  normalizeCrops(input.Crop, input.Crops),
	}
	if farm.Status == "" {
		farm.Status = "Healthy"
	}
	if len(farm.Crops) > 0 {
		farm.Crop = farm.Crops[0]
	} else if input.Crop != "" {
		farm.Crop = input.Crop
		farm.Crops = []string{input.Crop}
	}

	s.farms[farmID] = farm
	return farm, nil
}

func (s *Store) Update(id string, input domain.FarmInput) (domain.Farm, bool, error) {
	if strings.TrimSpace(input.Name) == "" {
		return domain.Farm{}, false, fmt.Errorf("farm name is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	farm, ok := s.farms[id]
	if !ok {
		return domain.Farm{}, false, nil
	}

	farm.Name = input.Name
	if input.Status != "" {
		farm.Status = input.Status
	}
	if len(normalizeCrops(input.Crop, input.Crops)) > 0 {
		farm.Crops = normalizeCrops(input.Crop, input.Crops)
		farm.Crop = farm.Crops[0]
	}

	s.farms[id] = farm
	return farm, true, nil
}

func (s *Store) Delete(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.farms[id]; !exists {
		return false
	}
	delete(s.farms, id)
	return true
}

func (s *Store) AddCrop(id, cropName string) (domain.Farm, bool, error) {
	cropName = strings.TrimSpace(cropName)
	if cropName == "" {
		return domain.Farm{}, false, fmt.Errorf("crop name is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	farm, ok := s.farms[id]
	if !ok {
		return domain.Farm{}, false, nil
	}

	farm.Crops = normalizeCrops("", append(farm.Crops, cropName))
	if len(farm.Crops) > 0 {
		farm.Crop = farm.Crops[0]
	}
	s.farms[id] = farm
	return farm, true, nil
}

func (s *Store) RemoveCrop(id, cropName string) (domain.Farm, bool, error) {
	cropName = strings.TrimSpace(cropName)
	if cropName == "" {
		return domain.Farm{}, false, fmt.Errorf("crop name is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	farm, ok := s.farms[id]
	if !ok {
		return domain.Farm{}, false, nil
	}

	remaining := make([]string, 0, len(farm.Crops))
	for _, crop := range farm.Crops {
		if strings.EqualFold(crop, cropName) {
			continue
		}
		remaining = append(remaining, crop)
	}
	farm.Crops = remaining
	if len(farm.Crops) > 0 {
		farm.Crop = farm.Crops[0]
	} else {
		farm.Crop = ""
	}

	s.farms[id] = farm
	return farm, true, nil
}
