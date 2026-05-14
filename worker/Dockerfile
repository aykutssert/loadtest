FROM golang:1.22-alpine AS build
WORKDIR /app
COPY . .
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o worker .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /app/worker .
ENTRYPOINT ["./worker"]
