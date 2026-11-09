FROM python:3.12-slim
WORKDIR /app
COPY . .
ENV WEBGENTZ_DB=/data/webgentz.db
VOLUME ["/data"]
EXPOSE 8080
CMD ["python3", "server.py"]
