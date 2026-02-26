# Stage 1: Build the React app
FROM node:20-alpine AS build

WORKDIR /app

# Install bash and sed for build-prod.sh
RUN apk add --no-cache bash sed

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .

# REACT_APP_BACKEND_URL must be set at build time
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL}

ARG REACT_APP_VAPID_PUBLIC_KEY
ENV REACT_APP_VAPID_PUBLIC_KEY=${REACT_APP_VAPID_PUBLIC_KEY}

ARG REACT_APP_STRIPE_PUBLISHABLE_KEY
ENV REACT_APP_STRIPE_PUBLISHABLE_KEY=${REACT_APP_STRIPE_PUBLISHABLE_KEY}

# Prevent CI from treating warnings as errors
ENV CI=false

RUN chmod +x build-prod.sh && bash build-prod.sh

# Stage 2: Serve with nginx
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
