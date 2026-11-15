package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type mediaRequest struct {
	Operation string                 `json:"operation"`
	MediaType string                 `json:"mediaType"`
	FileName  string                 `json:"fileName"`
	DataURL   string                 `json:"dataUrl"`
	Mode      string                 `json:"mode"`
	Metadata  map[string]interface{} `json:"metadata"`
}

type mediaResponse struct {
	OK        bool                   `json:"ok"`
	Mode      string                 `json:"mode"`
	Operation string                 `json:"operation"`
	Message   string                 `json:"message"`
	FileName  string                 `json:"fileName"`
	Size      int64                  `json:"size"`
	Output    string                 `json:"output,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	Status    string                 `json:"status,omitempty"`
	JobID     string                 `json:"jobId,omitempty"`
	Progress  float64                `json:"progress,omitempty"`
	Error     string                 `json:"error,omitempty"`
}

type exportJob struct {
	mu        sync.RWMutex
	ID        string    `json:"id"`
	Status    string    `json:"status"`
	Message   string    `json:"message"`
	FileName  string    `json:"fileName"`
	Output    string    `json:"output,omitempty"`
	Progress  float64   `json:"progress"`
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (j *exportJob) update(status, message, output, errStr string, progress float64) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = status
	j.Message = message
	if output != "" {
		j.Output = output
	}
	if errStr != "" {
		j.Error = errStr
	}
	j.Progress = progress
	j.UpdatedAt = time.Now()
}

func (j *exportJob) snapshot() exportJob {
	j.mu.RLock()
	defer j.mu.RUnlock()
	return exportJob{
		ID:        j.ID,
		Status:    j.Status,
		Message:   j.Message,
		FileName:  j.FileName,
		Output:    j.Output,
		Progress:  j.Progress,
		Error:     j.Error,
		CreatedAt: j.CreatedAt,
		UpdatedAt: j.UpdatedAt,
	}
}

var exportJobs sync.Map

func decodeDataURL(dataURL string) ([]byte, error) {
	trimmed := strings.TrimSpace(dataURL)
	if trimmed == "" {
		return nil, fmt.Errorf("empty data URL")
	}

	payload := trimmed
	if idx := strings.Index(payload, ","); idx >= 0 {
		payload = payload[idx+1:]
	}
	if strings.TrimSpace(payload) == "" {
		return nil, fmt.Errorf("encoded payload is empty")
	}

	if decoded, err := base64.StdEncoding.DecodeString(payload); err == nil {
		return decoded, nil
	}
	return base64.RawStdEncoding.DecodeString(payload)
}

func buildSubtitleSRT(raw interface{}) string {
	tracks, ok := raw.([]interface{})
	if !ok {
		return ""
	}

	var content strings.Builder
	cueIndex := 1

	for _, item := range tracks {
		track, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		segments, ok := track["segments"].([]interface{})
		if !ok {
			continue
		}

		for _, segmentItem := range segments {
			segment, ok := segmentItem.(map[string]interface{})
			if !ok {
				continue
			}

			start, _ := segment["start"].(float64)
			end, _ := segment["end"].(float64)
			text, _ := segment["text"].(string)
			text = strings.TrimSpace(text)
			if text == "" {
				continue
			}

			content.WriteString(strconv.Itoa(cueIndex))
			content.WriteString("\n")
			content.WriteString(formatSRTTimestamp(start))
			content.WriteString(" --> ")
			content.WriteString(formatSRTTimestamp(end))
			content.WriteString("\n")
			content.WriteString(text)
			content.WriteString("\n\n")
			cueIndex++
		}
	}

	return strings.TrimSpace(content.String())
}

func formatSRTTimestamp(seconds float64) string {
	if seconds < 0 {
		seconds = 0
	}
	whole := int(seconds)
	ms := int((seconds - float64(whole)) * 1000)
	hours := whole / 3600
	minutes := (whole % 3600) / 60
	secs := whole % 60

	return fmt.Sprintf("%02d:%02d:%02d,%03d", hours, minutes, secs, ms)
}

func ensureExportDirectory() string {
	exportDir := filepath.Join(os.TempDir(), "dolomite-exports")
	if err := os.MkdirAll(exportDir, 0o755); err != nil {
		return os.TempDir()
	}
	return exportDir
}

func safeExportName(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		trimmed = "dolomite-export.mp4"
	}
	trimmed = strings.NewReplacer("/", "-", "\\", "-").Replace(trimmed)
	trimmed = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			return r
		}
		return '-'
	}, trimmed)
	if filepath.Ext(trimmed) == "" {
		trimmed += ".mp4"
	}
	return trimmed
}

func metadataFloat(metadata map[string]interface{}, key string) float64 {
	if metadata == nil {
		return 0
	}
	value, found := metadata[key]
	if !found || value == nil {
		return 0
	}

	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int32:
		return float64(typed)
	case int64:
		return float64(typed)
	case string:
		if parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64); err == nil {
			return parsed
		}
	}
	return 0
}

func metadataBool(metadata map[string]interface{}, key string) bool {
	if metadata == nil {
		return false
	}
	value, found := metadata[key]
	if !found || value == nil {
		return false
	}

	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		t := strings.TrimSpace(typed)
		return strings.EqualFold(t, "true") || strings.EqualFold(t, "1")
	case float64:
		return typed != 0
	case int:
		return typed != 0
	}
	return false
}

func metadataMap(metadata map[string]interface{}, key string) map[string]interface{} {
	if metadata == nil {
		return nil
	}
	value, found := metadata[key]
	if !found || value == nil {
		return nil
	}
	parsed, ok := value.(map[string]interface{})
	if !ok {
		return nil
	}
	return parsed
}

func normalizeExportExtension(name string, metadata map[string]interface{}) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		trimmed = "dolomite-export.mp4"
	}

	ext := filepath.Ext(trimmed)
	if ext == "" {
		ext = ".mp4"
	}
	if formatValue, ok := metadata["format"].(string); ok {
		requested := strings.ToLower(strings.TrimSpace(formatValue))
		if requested == "mp4" || requested == "webm" || requested == "mov" || requested == "mkv" || requested == "avi" {
			ext = "." + requested
		}
	}

	base := strings.TrimSuffix(trimmed, filepath.Ext(trimmed))
	return base + ext
}

func resolveResolution(metadata map[string]interface{}) string {
	if metadata == nil {
		return ""
	}

	value, ok := metadata["resolution"].(string)
	if !ok {
		return ""
	}

	switch strings.ToLower(strings.TrimSpace(value)) {
	case "480p":
		return "854:480"
	case "720p":
		return "1280:720"
	case "1080p":
		return "1920:1080"
	case "2k":
		return "2048:1080"
	case "1440p":
		return "2560:1440"
	case "2160p":
		return "3840:2160"
	default:
		return ""
	}
}

func buildVideoFilterString(req mediaRequest) string {
	parts := make([]string, 0, 8)

	if metadataBool(req.Metadata, "flipH") {
		parts = append(parts, "hflip")
	}
	if metadataBool(req.Metadata, "flipV") {
		parts = append(parts, "vflip")
	}

	rotation := int(metadataFloat(req.Metadata, "rotation"))
	switch rotation % 360 {
	case 90:
		parts = append(parts, "transpose=1")
	case 180:
		parts = append(parts, "transpose=2,transpose=2")
	case 270:
		parts = append(parts, "transpose=2")
	}

	if resolvedResolution := resolveResolution(req.Metadata); resolvedResolution != "" {
		parts = append(parts, "scale="+resolvedResolution)
	}

	if filters := metadataMap(req.Metadata, "filters"); len(filters) > 0 {
		brightness := metadataFloat(filters, "brightness")
		contrast := metadataFloat(filters, "contrast")
		saturation := metadataFloat(filters, "saturate")
		if saturation == 0 {
			saturation = metadataFloat(filters, "saturation")
		}
		exposure := metadataFloat(filters, "exposure")
		if brightness != 0 || contrast != 0 || saturation != 0 || exposure != 0 {
			parts = append(parts, fmt.Sprintf("eq=brightness=%0.2f:contrast=%0.2f:saturation=%0.2f", brightness/200.0, 1.0+contrast/100.0, 1.0+saturation/100.0))
		}
	}

	if blur := metadataFloat(req.Metadata, "blur"); blur > 0 {
		parts = append(parts, fmt.Sprintf("gblur=sigma=%0.2f", blur/8.0))
	}

	return strings.Join(parts, ",")
}

func buildVideoExportArgs(req mediaRequest, sourcePath string, audioInputs []string, subtitlePath string) []string {
	args := []string{"-y"}

	trimStart := metadataFloat(req.Metadata, "trimStart")
	trimEnd := metadataFloat(req.Metadata, "trimEnd")
	if trimStart > 0 {
		args = append(args, "-ss", strconv.FormatFloat(trimStart, 'f', 3, 64))
	}

	args = append(args, "-i", sourcePath)

	if trimEnd > trimStart && trimEnd > 0 {
		args = append(args, "-to", strconv.FormatFloat(trimEnd-trimStart, 'f', 3, 64))
	}

	for _, audioPath := range audioInputs {
		args = append(args, "-i", audioPath)
	}
	if subtitlePath != "" {
		args = append(args, "-i", subtitlePath)
	}

	if videoFilters := buildVideoFilterString(req); videoFilters != "" {
		args = append(args, "-vf", videoFilters)
	}

	if fps := metadataFloat(req.Metadata, "fps"); fps > 0 {
		args = append(args, "-r", strconv.FormatFloat(fps, 'f', 0, 64))
	}

	args = append(args, "-map", "0:v")
	if len(audioInputs) > 0 {
		for index := range audioInputs {
			args = append(args, "-map", fmt.Sprintf("%d:a?", index+1))
		}
	} else {
		args = append(args, "-map", "0:a?")
	}
	if subtitlePath != "" {
		args = append(args, "-map", fmt.Sprintf("%d:s?", len(audioInputs)+1))
	}

	if bitrate := int(metadataFloat(req.Metadata, "bitrate")); bitrate > 0 {
		args = append(args, "-b:v", strconv.Itoa(bitrate))
	}
	if volume := metadataFloat(req.Metadata, "volume"); volume > 0 && volume != 1 {
		args = append(args, "-af", fmt.Sprintf("volume=%0.2f", volume))
	}
	args = append(args,
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-crf", "22",
		"-pix_fmt", "yuv420p",
		"-c:a", "aac",
		"-c:s", "mov_text",
		"-movflags", "+faststart",
		"-shortest",
	)

	return args
}

func queueVideoExport(req mediaRequest) (mediaResponse, error) {
	if strings.TrimSpace(req.DataURL) == "" {
		return mediaResponse{}, fmt.Errorf("missing source video payload")
	}

	jobID := fmt.Sprintf("video-%d", time.Now().UnixNano())
	job := &exportJob{
		ID:        jobID,
		Status:    "queued",
		Message:   "Video export queued on the server.",
		FileName:  strings.TrimSpace(req.FileName),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if job.FileName == "" {
		job.FileName = "dolomite-rendered.mp4"
	}
	exportJobs.Store(jobID, job)

	go func() {
		job.update("processing", "Rendering video on the server…", "", "", 5)

		result, err := processVideoExport(req)
		if err != nil {
			job.update("failed", err.Error(), "", err.Error(), 0)
			return
		}

		job.update("completed", result.Message, result.Output, "", 100)
	}()

	snap := job.snapshot()
	return mediaResponse{
		OK:        true,
		Mode:      req.Mode,
		Operation: req.Operation,
		Message:   "Video export queued on the server.",
		FileName:  snap.FileName,
		Status:    snap.Status,
		JobID:     jobID,
		Progress:  snap.Progress,
		Metadata:  req.Metadata,
	}, nil
}

func getExportJobStatus(jobID string) (exportJob, bool) {
	value, ok := exportJobs.Load(jobID)
	if !ok {
		return exportJob{}, false
	}
	job, ok := value.(*exportJob)
	if !ok || job == nil {
		return exportJob{}, false
	}
	return job.snapshot(), true
}

func processVideoExport(req mediaRequest) (mediaResponse, error) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return mediaResponse{}, fmt.Errorf("ffmpeg is not installed: %w", err)
	}

	videoBytes, err := decodeDataURL(req.DataURL)
	if err != nil {
		return mediaResponse{}, fmt.Errorf("decode source video: %w", err)
	}

	tmpDir, err := os.MkdirTemp("", "dolomite-video-export-*")
	if err != nil {
		return mediaResponse{}, fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	sourceName := safeExportName(req.FileName)
	sourcePath := filepath.Join(tmpDir, filepath.Base(sourceName))
	if err := os.WriteFile(sourcePath, videoBytes, 0o644); err != nil {
		return mediaResponse{}, fmt.Errorf("write source video: %w", err)
	}

	var audioInputs []string
	if rawAudio, ok := req.Metadata["audioTracks"]; ok {
		if tracks, ok := rawAudio.([]interface{}); ok {
			for _, item := range tracks {
				track, ok := item.(map[string]interface{})
				if !ok {
					continue
				}
				dataURL, _ := track["dataUrl"].(string)
				audioBytes, err := decodeDataURL(dataURL)
				if err != nil {
					continue
				}
				audioPath := filepath.Join(tmpDir, fmt.Sprintf("audio-track-%d.wav", len(audioInputs)+1))
				if err := os.WriteFile(audioPath, audioBytes, 0o644); err != nil {
					continue
				}
				audioInputs = append(audioInputs, audioPath)
			}
		}
	}

	var subtitlePath string
	if rawCaptionTracks, ok := req.Metadata["captionTracks"]; ok {
		if subtitles := buildSubtitleSRT(rawCaptionTracks); subtitles != "" {
			subtitlePath = filepath.Join(tmpDir, "captions.srt")
			if err := os.WriteFile(subtitlePath, []byte(subtitles), 0o644); err != nil {
				return mediaResponse{}, fmt.Errorf("write subtitles: %w", err)
			}
		}
	}

	outputName := normalizeExportExtension(safeExportName(req.FileName), req.Metadata)
	exportDir := ensureExportDirectory()
	outputPath := filepath.Join(exportDir, fmt.Sprintf("%d-%s", time.Now().UnixNano(), outputName))

	args := buildVideoExportArgs(req, sourcePath, audioInputs, subtitlePath)
	args = append(args, outputPath)

	cmd := exec.Command("ffmpeg", args...)
	if combined, err := cmd.CombinedOutput(); err != nil {
		return mediaResponse{}, fmt.Errorf("ffmpeg render failed: %w (output: %s)", err, strings.TrimSpace(string(combined)))
	}

	fileInfo, err := os.Stat(outputPath)
	if err != nil {
		return mediaResponse{}, fmt.Errorf("read rendered output stats: %w", err)
	}
	if fileInfo.Size() == 0 {
		return mediaResponse{}, fmt.Errorf("ffmpeg produced an empty render")
	}

	return mediaResponse{
		OK:        true,
		Mode:      req.Mode,
		Operation: req.Operation,
		Message:   fmt.Sprintf("FFmpeg render completed for %s and wrote %d bytes.", req.FileName, fileInfo.Size()),
		FileName:  outputName,
		Size:      fileInfo.Size(),
		Output:    outputPath,
		Metadata:  req.Metadata,
	}, nil
}

func serveExportFile(w http.ResponseWriter, r *http.Request, filePath string) {
	cleanPath := filepath.Clean(filePath)
	if strings.TrimSpace(filePath) == "" || !strings.HasPrefix(cleanPath, filepath.Clean(os.TempDir())) {
		http.Error(w, `{"error":"invalid or missing export file path"}`, http.StatusBadRequest)
		return
	}

	fileInfo, err := os.Stat(cleanPath)
	if err != nil || fileInfo.IsDir() {
		http.Error(w, `{"error":"exported file not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filepath.Base(cleanPath)))
	http.ServeFile(w, r, cleanPath)
}

func HandleMediaOperation(w http.ResponseWriter, r *http.Request, mediaType string, fallbackOperation string) {
	var req mediaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
		return
	}

	if strings.TrimSpace(req.Operation) == "" {
		req.Operation = fallbackOperation
	}
	if strings.TrimSpace(req.Mode) == "" {
		req.Mode = "server"
	}
	if strings.TrimSpace(req.MediaType) == "" {
		req.MediaType = mediaType
	}
	if strings.TrimSpace(req.FileName) == "" {
		req.FileName = fmt.Sprintf("processed-%s.bin", req.MediaType)
	}

	if req.Operation == "video-export" || (req.MediaType == "video" && req.Operation == "video-export") {
		if req.Mode == "server" && metadataBool(req.Metadata, "async") {
			result, err := queueVideoExport(req)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(result)
			return
		}

		result, err := processVideoExport(req)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(result)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(mediaResponse{
		OK:        true,
		Mode:      req.Mode,
		Operation: req.Operation,
		Message:   fmt.Sprintf("Operation %s accepted for %s.", req.Operation, req.MediaType),
		FileName:  req.FileName,
		Metadata:  req.Metadata,
	})
}
