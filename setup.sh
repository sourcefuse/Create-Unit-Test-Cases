#!/bin/bash
rm -rf tmp/
# Create tmp directory if it doesn't exist
if [ ! -d "tmp" ]; then
    echo "Creating tmp directory..."
    mkdir -p tmp
    echo "tmp directory created successfully"
else
    echo "tmp directory already exists"
fi


# Check if GITHUB_TOKEN is set
if [ -z "$GITHUB_TOKEN" ]; then
    echo "Warning: GITHUB_TOKEN not set. Attempting clone without authentication..."
    cd tmp && git clone https://github.com/sourcefuse/telescope-health-patient-portal-ui.git repo
else
    echo "Using GITHUB_TOKEN for authentication..."
    cd tmp && git clone https://$GITHUB_TOKEN:x-oauth-basic@github.com/sourcefuse/telescope-health-patient-portal-ui.git repo
fi
ls

# npm start
# npm run analyze-project