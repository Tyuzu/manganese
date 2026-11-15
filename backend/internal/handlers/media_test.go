package handlers

import (
	"strings"
	"testing"
)

func TestNormalizeExportExtensionPrefersMetadataFormat(t *testing.T) {
	name := normalizeExportExtension("rendered.mp4", map[string]interface{}{
		"format": "webm",
	})

	if name != "rendered.webm" {
		t.Fatalf("expected webm extension, got %q", name)
	}
}

func TestBuildVideoExportArgsHonorsMetadata(t *testing.T) {
	req := mediaRequest{
		FileName: "rendered.mp4",
		Metadata: map[string]interface{}{
			"resolution": "1080p",
			"fps":        30.0,
			"bitrate":    5000000.0,
			"trimStart":  1.5,
			"trimEnd":    14.740744,
			"rotation":   90.0,
			"flipH":      true,
			"filters": map[string]interface{}{
				"brightness": 200.0,
				"contrast":   63.9,
				"saturate":   0.0,
			},
		},
	}

	args := buildVideoExportArgs(req, "/tmp/input.mp4", nil, "")
	joined := strings.Join(args, " ")

	if !strings.Contains(joined, "-ss 1.500") {
		t.Fatalf("trim start not encoded into ffmpeg args: %s", joined)
	}
	if !strings.Contains(joined, "-to 13.241") {
		t.Fatalf("trim end not encoded into ffmpeg args: %s", joined)
	}
	if !strings.Contains(joined, "scale=1920:1080") {
		t.Fatalf("resolution not encoded into ffmpeg args: %s", joined)
	}
	if !strings.Contains(joined, "transpose=1") {
		t.Fatalf("rotation not encoded into ffmpeg args: %s", joined)
	}
	if !strings.Contains(joined, "-r 30") {
		t.Fatalf("fps not encoded into ffmpeg args: %s", joined)
	}
	if !strings.Contains(joined, "hflip") {
		t.Fatalf("horizontal flip not encoded into ffmpeg args: %s", joined)
	}
	if !strings.Contains(joined, "-b:v 5000000") {
		t.Fatalf("bitrate not encoded into ffmpeg args: %s", joined)
	}
}

func TestQueueVideoExportCreatesStatusJob(t *testing.T) {
	result, err := queueVideoExport(mediaRequest{
		Operation: "video-export",
		MediaType: "video",
		Mode:      "server",
		FileName:  "job-check.mp4",
		DataURL:   "data:video/mp4;base64,AAAA",
		Metadata: map[string]interface{}{
			"async": true,
		},
	})
	if err != nil {
		t.Fatalf("expected async queue to be created without immediate error, got %v", err)
	}
	if result.JobID == "" {
		t.Fatalf("expected job id to be set")
	}
	if result.Status != "queued" {
		t.Fatalf("expected queued status, got %q", result.Status)
	}
	if !strings.HasPrefix(result.JobID, "video-") {
		t.Fatalf("expected queue id prefix, got %q", result.JobID)
	}
}
