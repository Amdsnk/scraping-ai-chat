FROM node:18-alpine
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the application files
COPY . .

# Expose the port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
