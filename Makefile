DEV_COMPOSE_FILE=infra/docker-compose.yml
DEBUG_COMPOSE_FILE=infra/docker-compose.debug.yml
TEST_COMPOSE_FILE=infra/docker-compose.test.yml
CONTAINER_ID=$(shell docker ps --filter "name=taskforge-gateway" --format "{{.ID}}")

## Docker Compose commands

.PHONY: up-no-build
up-no-build:
	docker compose -f $(DEV_COMPOSE_FILE) up -d

.PHONY: up-build
up-build:
	docker compose -f $(DEV_COMPOSE_FILE) up --build -d

.PHONY: down
down:
	docker compose -f ${DEV_COMPOSE_FILE} down

.PHONY: restart
restart:
	$(MAKE) down
	$(MAKE) up-build


# .PHONY: logs-gateway
# logs-gateway:
# 	$(MAKE) logs name=gateway

# .PHONY: exec
# exec:
# 	docker exec -it ${CONTAINER_ID} sh


.PHONY: exec
exec:
	docker exec -it $$(docker ps --filter "name=$(name)" --format "{{.ID}}") sh


.PHONY: logs
logs:
	docker logs -f $$(docker ps --filter "name=$(name)" --format "{{.ID}}")


