# Astra-Q Quick Start Commands

Use these commands to quickly spin up the entire Astra-Q platform after the initial setup is complete.

## 1. Start Infrastructure & Backend
Boot up the PostgreSQL, Redis, Kafka, Zookeeper, and the FastAPI backend containers.
```bash
cd infra
docker compose up -d
```
*(Wait a few seconds for all services to become healthy)*

## 2. Start the Frontend
In a new terminal window, start the Next.js development server:
```bash
cd frontend
npm run dev
```
The application will be available at **http://localhost:3000**.

## 3. Start Data Ingestion (Kafka Producer)
To simulate live threat data, run the dataset producer in sample mode. This streams the CERT r4.2 dataset into Kafka for the backend to process:
```bash
cd infra
docker compose exec -d backend python -m backend.ingestion.kafka_producer --sample
```

---

## Useful Commands
- **View backend logs**: `docker compose -f infra/docker-compose.yml logs -f backend`
- **Check service status**: `docker compose -f infra/docker-compose.yml ps`
- **Stop all services**: `docker compose -f infra/docker-compose.yml down`

