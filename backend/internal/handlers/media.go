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
	Size      int                    `json:"size"`
	Output    string                 `json:"output,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

func decodeDataURL(dataURL string) ([]byte, error) {
	if strings.TrimSpace(dataURL) == "" {
		return nil, fmt.Errorf("empty data URL")
	}

	payload := dataURL
	if idx := strings.Index(payload, ","); idx >= 0 {
		payload = payload[idx+1:]
	}
	if strings.TrimSpace(payload) == "" {
		return nil, fmt.Errorf("encoded payload is empty")
	}

	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err == nil {
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

func formatSRTTimestamp(value interface{}) string {
	seconds, ok := value.(float64)
	if !ok {
		return "00:00:00,000"
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
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' || r == '.' {
			return r
		}
		return '-'
	}, trimmed)
	if filepath.Ext(trimmed) == "" {
		trimmed += ".mp4"
	}
	return trimmed
}

func processVideoExport(req mediaRequest) (mediaResponse, error) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return mediaResponse{}, fmt.Errorf("ffmpeg is not installed: %w", err)
	}

	if strings.TrimSpace(req.DataURL) == "" {
		return mediaResponse{}, fmt.Errorf("missing source video payload")
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

	sourceName := safeExportName(strings.TrimSpace(req.FileName))
	if sourceName == "" {
		sourceName = "source-video.mp4"
	}

	sourcePath := filepath.Join(tmpDir, filepath.Base(sourceName))
	if err := os.WriteFile(sourcePath, videoBytes, 0o644); err != nil {
		return mediaResponse{}, fmt.Errorf("write source video: %w", err)
	}

	audioInputs := []string{}
	if rawAudio, ok := req.Metadata["audioTracks"]; ok {
		tracks, ok := rawAudio.([]interface{})
		if ok {
			for _, item := range tracks {
				track, ok := item.(map[string]interface{})
				if !ok {
					continue
				}
				dataURL, _ := track["dataUrl"].(string)
				if strings.TrimSpace(dataURL) == "" {
					continue
				}
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

	subtitlePath := ""
	if rawCaptionTracks, ok := req.Metadata["captionTracks"]; ok {
		subtitles := buildSubtitleSRT(rawCaptionTracks)
		if strings.TrimSpace(subtitles) != "" {
			subtitlePath = filepath.Join(tmpDir, "captions.srt")
			if err := os.WriteFile(subtitlePath, []byte(subtitles), 0o644); err != nil {
				return mediaResponse{}, fmt.Errorf("write subtitles: %w", err)
			}
		}
	}

	outputName := safeExportName(strings.TrimSpace(req.FileName))
	if outputName == "" {
		outputName = "dolomite-rendered.mp4"
	}
	if filepath.Ext(outputName) == "" {
		outputName += ".mp4"
	}
	exportDir := ensureExportDirectory()
	outputPath := filepath.Join(exportDir, fmt.Sprintf("%d-%s", time.Now().UnixNano(), outputName))

	args := []string{"-y", "-i", sourcePath}
	for _, audioPath := range audioInputs {
		args = append(args, "-i", audioPath)
	}
	if subtitlePath != "" {
		args = append(args, "-i", subtitlePath)
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
	args = append(args,
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-crf", "22",
		"-pix_fmt", "yuv420p",
		"-c:a", "aac",
		"-c:s", "mov_text",
		"-movflags", "+faststart",
		"-shortest",
		outputPath,
	)

	cmd := exec.Command("ffmpeg", args...)
	combined, err := cmd.CombinedOutput()
	if err != nil {
		return mediaResponse{}, fmt.Errorf("ffmpeg render failed: %w (output: %s)", err, strings.TrimSpace(string(combined)))
	}

	renderedBytes, err := os.ReadFile(outputPath)
	if err != nil {
		return mediaResponse{}, fmt.Errorf("read rendered output: %w", err)
	}

	if len(renderedBytes) == 0 {
		return mediaResponse{}, fmt.Errorf("ffmpeg produced an empty render")
	}

	response := mediaResponse{
		OK:        true,
		Mode:      req.Mode,
		Operation: req.Operation,
		Message:   fmt.Sprintf("FFmpeg render completed for %s and wrote %d bytes.", req.FileName, len(renderedBytes)),
		FileName:  outputName,
		Size:      len(renderedBytes),
		Output:    outputPath,
		Metadata:  req.Metadata,
	}
	if req.Mode == "server" {
		response.Output = outputPath
	}

	return response, nil
}

func serveExportFile(w http.ResponseWriter, _ *http.Request, filePath string) {
	if strings.TrimSpace(filePath) == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "missing export file path"})
		return
	}

	cleanPath := filepath.Clean(filePath)
	if !strings.HasPrefix(cleanPath, filepath.Clean(os.TempDir())) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid export path"})
		return
	}

	fileInfo, err := os.Stat(cleanPath)
	if err != nil || fileInfo.IsDir() {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "exported file not found"})
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filepath.Base(cleanPath)))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", fileInfo.Size()))

	data, err := os.ReadFile(cleanPath)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "failed to read exported file"})
		return
	}

	_, _ = w.Write(data)
}

func handleMediaOperation(w http.ResponseWriter, r *http.Request, mediaType string, fallbackOperation string) {
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

	payloadSize := 0
	if req.DataURL != "" {
		payload := req.DataURL
		if idx := strings.Index(payload, ","); idx >= 0 {
			payload = payload[idx+1:]
		}
		if decoded, err := base64.StdEncoding.DecodeString(payload); err == nil {
			payloadSize = len(decoded)
		} else {
			payloadSize = len(payload)
		}
	}

	resp := mediaResponse{
		OK:        true,
		Mode:      req.Mode,
		Operation: req.Operation,
		Message:   fmt.Sprintf("%s accepted for %s processing on the %s pipeline.", req.Operation, req.MediaType, req.Mode),
		FileName:  req.FileName,
		Size:      payloadSize,
		Metadata:  req.Metadata,
	}

	if req.Operation == "video-export" || (req.MediaType == "video" && req.Operation == "video-export") {
		result, err := processVideoExport(req)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		resp = result
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}
