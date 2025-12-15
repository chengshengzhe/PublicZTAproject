# Build phase
FROM node:18 AS builder
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

# Deploy phase
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html/frontend/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
