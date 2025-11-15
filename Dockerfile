# Stage 1: Build the app
FROM node:20.14.0-alpine AS builder

# Install bash 
RUN apk add --no-cache bash

# Install global packages 
RUN npm install -g @nestjs/cli typescript ts-node

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

# Remove carriage returns from any copied scripts
RUN find . -type f -name '*.sh' -exec sed -i 's/\r$//' {} +

RUN npm run build

# Stage 2: Create a smaller image for production
FROM node:20.14.0-alpine

WORKDIR /usr/src/app

# Copy only necessary files from the builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./

# Accept .env file as a build argument
ARG ENV_FILE
COPY $ENV_FILE .env

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
