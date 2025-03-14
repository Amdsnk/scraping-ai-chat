FROM mcr.microsoft.com/playwright:v1.40.0-focal

WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies with verbose output and more debugging info
RUN npm install --only=production

# Copy the rest of the application files
COPY . .

# Install Playwright browsers
RUN npx playwright install chromium

# Expose the port (this is for documentation, Railway will still use the PORT env var)
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
