
.PHONY: logs-gateway
logs-gateway:
	$(MAKE) logs name=gateway

.PHONY: exec
exec-gateway:
	$(MAKE) exec name=gateway


.PHONY: exec
exec:
	docker exec -it $$(docker ps --filter "name=$(name)" --format "{{.ID}}") sh


.PHONY: logs
logs:
	docker logs -f $$(docker ps --filter "name=$(name)" --format "{{.ID}}")