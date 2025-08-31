package image

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"net/http"

	"taskforge/resize-image/utils"

	"github.com/disintegration/imaging"
)

type TaskPayload = map[string]interface{}

var logger = utils.Log("resize-image")

func ProcessResizeTask(ctx context.Context, id string, task map[string]interface{}) error {
	payload := task
	taskId := id
	taskType := "resize-image"

	imageURL := payload["imageUrl"].(string)
	width := int(payload["width"].(float64))
	height := int(payload["height"].(float64))

	contextLogger := logger.With().Str("taskId", taskId).Logger()

	// check cache
	cached, err := utils.Get_cached_output(taskType, taskId)

	if err != nil {
		contextLogger.Info().Msgf("🔧 Image not found in cache")
	}

	s3Key := fmt.Sprintf("%s/%s.jpg", "image", taskId)

	if cached != nil {
		utils.PublishTaskResult(taskId, cached)
		return nil
	}

	// check url
	exist, err := utils.CheckFileExists(s3Key)

	if err != nil {
		contextLogger.Error().Stack().Err(err).Msg("failed to load image")
	}

	if exist {
		url, err := utils.GenerateSignedUrl(s3Key, 1)
		if err != nil {
			contextLogger.Error().Stack().Err(err).Msg("failed to load image")
		}
		utils.PublishTaskResult(taskId, map[string]interface{}{
			"url":    url,
			"cached": true,
		})
		utils.Cache_task_output(taskType, taskId, cached)
		return nil
	}

	contextLogger.Info().Msgf("🔧 Resizing image to %dx%d: %s", width, height, imageURL)

	resp, err := http.Get(imageURL)
	if err != nil {
		utils.PublishTaskResult(taskId, map[string]interface{}{
			"success": false,
			"error":   "Failed to download image",
		})
		return fmt.Errorf("failed to download image: %w", err)
	}
	defer resp.Body.Close()

	img, _, err := image.Decode(resp.Body)
	if err != nil {
		utils.PublishTaskResult(taskId, map[string]interface{}{
			"success": false,
			"error":   "Invalid image format",
		})
		return fmt.Errorf("failed to decode image: %w", err)
	}

	resized := imaging.Resize(img, width, height, imaging.Lanczos)

	var buf bytes.Buffer
	err = imaging.Encode(&buf, resized, imaging.JPEG)
	if err != nil {
		utils.PublishTaskResult(taskId, map[string]interface{}{
			"success": false,
			"error":   "Image encoding failed",
		})
		return fmt.Errorf("failed to encode resized image: %w", err)
	}

	s3url, err := utils.UploadBufferToS3(buf.Bytes(), "image", "image/jpeg", taskId)
	if err != nil {
		utils.PublishTaskResult(taskId, map[string]interface{}{
			"success": false,
			"error":   "S3 upload failed",
		})
		return fmt.Errorf("S3 upload failed: %w", err)
	}

	utils.PublishTaskResult(taskId, map[string]interface{}{
		"success": true,
		"url":     s3url,
	})

	contextLogger.Info().Msgf("✅ Resized image uploaded: %s", s3url)
	return nil
}
