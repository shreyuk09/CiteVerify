# Python-only image: the whole website is prebuilt into backend/main.py, so no Node.js is needed.
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Bake the claim-verification model (~740 MB) into the image so the first analysis does not wait for a download.
ENV HF_HOME=/opt/hf
RUN python -c "from transformers import AutoTokenizer, AutoModelForSequenceClassification as M; \
m='jedick/DeBERTa-v3-base-mnli-fever-anli-scifact-citint'; AutoTokenizer.from_pretrained(m); M.from_pretrained(m)"
COPY backend/main.py ./
ENV DATABASE_URL=sqlite:////data/citeverify.db \
    PORT=8000
RUN mkdir -p /data
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
