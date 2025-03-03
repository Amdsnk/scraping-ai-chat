# Use a lightweight Node.js image
FROM node:18-alpine 

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker caching
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy the rest of the application files
COPY . .

# Expose the port your Express server runs on
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
