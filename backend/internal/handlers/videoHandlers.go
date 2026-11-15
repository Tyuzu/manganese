package handlers

import (
	"bufio"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"
)

// HandleVideoProcess handles video processing operations.
func HandleVideoProcess(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	HandleMediaOperation(w, r, "video", "video-export")
}

// HandleVideoExport handles direct video export requests.
func HandleVideoExport(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	HandleMediaOperation(w, r, "video", "video-export")
}

// HandleVideoExportStatus checks the progress of an asynchronous export job.
func HandleVideoExportStatus(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	jobID := ps.ByName("jobId")
	if jobID == "" {
		jobID = r.URL.Query().Get("jobId")
	}

	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing jobId"})
		return
	}

	job, ok := getExportJobStatus(jobID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
		return
	}

	response := map[string]interface{}{
		"ok":       true,
		"jobId":    job.ID,
		"status":   job.Status,
		"message":  job.Message,
		"fileName": job.FileName,
		"progress": job.Progress,
	}
	if job.Output != "" {
		response["output"] = job.Output
	}
	if job.Error != "" {
		response["error"] = job.Error
	}

	writeJSON(w, http.StatusOK, response)
}

// HandleVideoDownload handles downloading rendered export files.
func HandleVideoDownload(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	pathValue := ps.ByName("path")
	if pathValue == "" {
		pathValue = r.URL.Query().Get("path")
	}

	pathValue = strings.TrimSpace(pathValue)
	if pathValue == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing path"})
		return
	}

	serveExportFile(w, r, pathValue)
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

func processVideoExportWithProgress(job *exportJob, req mediaRequest) (mediaResponse, error) {
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
	if filepath.Ext(sourceName) == "" {
		sourceName += ".mp4"
	}
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

	outputName := normalizeExportExtension(safeExportName(req.FileName), req.Metadata, ".mp4")
	exportDir := ensureExportDirectory()
	outputPath := filepath.Join(exportDir, fmt.Sprintf("%d-%s", time.Now().UnixNano(), outputName))

	args := buildVideoExportArgs(req, sourcePath, audioInputs, subtitlePath)
	args = append(args, outputPath)

	cmd := exec.Command("ffmpeg", args...)
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return mediaResponse{}, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return mediaResponse{}, fmt.Errorf("failed to start ffmpeg: %w", err)
	}

	var totalDurationSeconds float64
	trimStart := metadataFloat(req.Metadata, "trimStart")
	trimEnd := metadataFloat(req.Metadata, "trimEnd")

	scanner := bufio.NewScanner(stderrPipe)
	// Use custom split function to handle FFmpeg \r progress updates
	scanner.Split(scanLinesOrCarriageReturns)

	var stderrOutput strings.Builder

	for scanner.Scan() {
		line := scanner.Text()
		stderrOutput.WriteString(line)
		stderrOutput.WriteString("\n")

		// Parse total duration e.g. "Duration: 00:01:23.45"
		if strings.Contains(line, "Duration:") && totalDurationSeconds == 0 {
			parts := strings.Split(line, "Duration:")
			if len(parts) > 1 {
				subParts := strings.Split(parts[1], ",")
				if len(subParts) > 0 {
					totalDurationSeconds = parseDurationToSeconds(strings.TrimSpace(subParts[0]))
				}
			}
		}

		// Determine expected active duration (accounting for trimming)
		expectedDuration := totalDurationSeconds
		if trimEnd > trimStart && trimStart >= 0 {
			expectedDuration = trimEnd - trimStart
		} else if trimEnd > 0 && trimStart == 0 {
			expectedDuration = trimEnd
		}

		// Parse current encoding time e.g. "time=00:00:12.34"
		if strings.Contains(line, "time=") && expectedDuration > 0 {
			for _, token := range strings.Fields(line) {
				if strings.HasPrefix(token, "time=") {
					timeStr := strings.TrimPrefix(token, "time=")
					currentSeconds := parseDurationToSeconds(timeStr)
					if currentSeconds >= 0 {
						pct := 5.0 + (currentSeconds/expectedDuration)*90.0
						if pct > 95.0 {
							pct = 95.0
						}
						job.update("processing", "Rendering video on the server…", "", "", pct)
					}
				}
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return mediaResponse{}, fmt.Errorf("failed to read ffmpeg stderr: %w", err)
	}

	if err := cmd.Wait(); err != nil {
		return mediaResponse{}, fmt.Errorf("ffmpeg render failed: %w (output: %s)", err, strings.TrimSpace(stderrOutput.String()))
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

// scanLinesOrCarriageReturns splits input on either newline (\n) or carriage return (\r).
func scanLinesOrCarriageReturns(data []byte, atEOF bool) (advance int, token []byte, err error) {
	if atEOF && len(data) == 0 {
		return 0, nil, nil
	}
	for i := 0; i < len(data); i++ {
		if data[i] == '\n' {
			return i + 1, data[0:i], nil
		}
		if data[i] == '\r' {
			if i+1 < len(data) && data[i+1] == '\n' {
				return i + 2, data[0:i], nil
			}
			return i + 1, data[0:i], nil
		}
	}
	if atEOF {
		return len(data), data, nil
	}
	return 0, nil, nil
}

func parseDurationToSeconds(durStr string) float64 {
	durStr = strings.TrimSuffix(strings.TrimSpace(durStr), "s")
	if !strings.Contains(durStr, ":") {
		val, _ := strconv.ParseFloat(durStr, 64)
		return val
	}
	parts := strings.Split(durStr, ":")
	if len(parts) != 3 {
		return 0
	}
	hours, _ := strconv.ParseFloat(parts[0], 64)
	minutes, _ := strconv.ParseFloat(parts[1], 64)
	seconds, _ := strconv.ParseFloat(parts[2], 64)
	return hours*3600 + minutes*60 + seconds
}

// func parseDurationToSeconds(durStr string) float64 {
// 	parts := strings.Split(durStr, ":")
// 	if len(parts) != 3 {
// 		return 0
// 	}
// 	hours, _ := strconv.ParseFloat(parts[0], 64)
// 	minutes, _ := strconv.ParseFloat(parts[1], 64)
// 	seconds, _ := strconv.ParseFloat(parts[2], 64)
// 	return hours*3600 + minutes*60 + seconds
// }

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
