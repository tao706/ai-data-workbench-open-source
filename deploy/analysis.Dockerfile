FROM python:3.12-slim
WORKDIR /app/analysis-service
COPY analysis-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY analysis-service/app.py ./
RUN useradd -u 1000 -m workbench && mkdir -p /app/backend/uploads /app/analysis-service/output && chown -R 1000:1000 /app
USER workbench
EXPOSE 8100
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8100"]
