# Vastukala AI engine â€” build context is the REPO ROOT (needs engine/ + fixtures/).
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

COPY engine/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY engine ./engine
COPY fixtures ./fixtures
ENV GHARPLAN_FIXTURES_DIR=/app/fixtures

WORKDIR /app/engine
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
