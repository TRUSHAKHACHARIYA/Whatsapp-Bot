.PHONY: help dev prod stop logs migrate seed clean

help:
	@echo ""
	@echo "  WapiSend — Development Commands"
	@echo ""
	@echo "  make dev          Start all services in dev mode (hot reload)"
	@echo "  make prod         Start all services in production mode"
	@echo "  make stop         Stop all services"
	@echo "  make logs         Tail all service logs"
	@echo "  make migrate      Run database migrations"
	@echo "  make seed         Seed demo data"
	@echo "  make clean        Remove containers and volumes"
	@echo ""

dev:
	docker compose -f docker-compose.dev.yml up --build

prod:
	docker compose up --build -d

stop:
	docker compose down
	docker compose -f docker-compose.dev.yml down

logs:
	docker compose logs -f

migrate:
	docker compose exec backend alembic upgrade head

seed:
	docker compose exec backend python scripts/seed.py

clean:
	docker compose down -v
	docker compose -f docker-compose.dev.yml down -v

backend-shell:
	docker compose exec backend bash

db-shell:
	docker compose exec postgres psql -U postgres wapisend

redis-cli:
	docker compose exec redis redis-cli
