package utils

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/prometheus/client_golang/prometheus"
)

var logger = Log("resize-image")

func createS3Client(ctx context.Context) (*s3.Client, string, error) {
	bucket := os.Getenv("S3_BUCKET_NAME")
	if bucket == "" {
		return nil, "", fmt.Errorf("S3_BUCKET_NAME environment variable is required")
	}

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, "", fmt.Errorf("unable to load AWS config: %w", err)
	}

	client := s3.NewFromConfig(cfg)
	return client, bucket, nil
}

func UploadBufferToS3(buf []byte, prefix string, contentType string, taskId string) (string, error) {
	ctx := context.TODO()

	client, bucket, err := createS3Client(ctx)
	if err != nil {
		return "", err
	}

	key := fmt.Sprintf("%s/%s.jpg", prefix, taskId)

	uploader := manager.NewUploader(client)
	_, err = uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(buf),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		logger.Fatal().Err(err).Msg("upload failed")
		return "", fmt.Errorf("upload failed: %w", err)
	}

	presigner := s3.NewPresignClient(client)
	request, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = 24 * time.Hour
	})
	if err != nil {
		S3UploadFailures.With(prometheus.Labels{"type": "resize-image"}).Inc()
		return "", fmt.Errorf("failed to create presigned URL: %w", err)
	}

	return request.URL, nil
}

func GenerateSignedUrl(key string, expirationHours int) (string, error) {
	ctx := context.TODO()

	client, bucket, err := createS3Client(ctx)
	if err != nil {
		return "", err
	}
	presigner := s3.NewPresignClient(client)

	expiration := time.Duration(expirationHours) * time.Hour
	if expirationHours == 0 {
		expiration = 24 * time.Hour // default to 24 hours
	}

	request, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = expiration
	})

	if err != nil {
		return "", fmt.Errorf("failed to create presigned URL: %w", err)
	}

	return request.URL, nil
}

func CheckFileExists(key string) (bool, error) {
	ctx := context.TODO()

	client, bucket, err := createS3Client(ctx)
	if err != nil {
		return false, err
	}

	_, err = client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})

	if err != nil {
		// Check if it's a "not found" error
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) {
			if apiErr.ErrorCode() == "NotFound" || apiErr.ErrorCode() == "NoSuchKey" {
				return false, nil
			}
		}
		return false, fmt.Errorf("error checking if file exists: %w", err)
	}

	return true, nil
}
