package utils

import (
	"context"
	"encoding/json"
	"os"

	"github.com/redis/go-redis/v9"
)

var ctx = context.Background()
var rdb *redis.Client

func InitRedis() {
	logger := Log("resize-image")
	
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = os.Getenv("REDIS_URL")
	}
	if addr == "" {
		addr = "localhost:6379"
	}
	
	rdb = redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: os.Getenv("REDIS_PASSWORD"),
		DB:       0,
	})

	_, err := rdb.Ping(ctx).Result()
	if err != nil {
		logger.Fatal().Err(err).Msgf("❌ Redis connection failed")
	}

	logger.Info().Msg("✅ Connected to Redis")
}

func PublishTaskResult(taskId string, result map[string]any) error {
	key := "task:" + taskId + ":status"

	// err := rdb.HSet(ctx, key, result).Err()
	// if err != nil {
	// 	return err
	// }

	// err = rdb.Expire(ctx, key, 5*time.Minute).Err()
	// if err != nil {
	// 	return err
	// }

	payload, err := json.Marshal(result)
	if err != nil {
		return err
	}

	err = rdb.Publish(ctx, key, payload).Err()
	if err != nil {
		return err
	}

	return nil
}

func Cache_task_output(task_type string, task_id string, result map[string]any) error {
	key := "task:" + task_type + ":" + task_id + ":output"

	payload, err := json.Marshal(result)
	if err != nil {
		return err
	}

	err = rdb.SetEx(ctx, key, payload, 3600).Err()
	if err != nil {
		return err
	}

	return nil
}

func Get_cached_output(task_type string, task_id string) (map[string]any, error) {
	key := "task:" + task_type + ":" + task_id + ":output"

	payload, err := rdb.Get(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	var result map[string]any
	err = json.Unmarshal([]byte(payload), &result)
	if err != nil {
		return nil, err
	}

	return result, nil
}

func IsRedisHealthy() bool {
	if rdb == nil {
		return false
	}
	
	_, err := rdb.Ping(ctx).Result()
	return err == nil
}
