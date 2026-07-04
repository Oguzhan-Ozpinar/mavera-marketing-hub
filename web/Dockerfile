# Web (Vite SPA) → nginx ile statik servis
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Prod API adresi build anında gömülür (Coolify'da VITE_API_URL ver)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# SPA fallback (react-router) — tüm yollar index.html'e
RUN printf 'server {\n listen 80;\n location / {\n  root /usr/share/nginx/html;\n  try_files $uri /index.html;\n }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
