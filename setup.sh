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


cd tmp && git clone https://github.com/sourcefuse/telescope-health-patient-portal-ui.git repo
ls

# npm start
# npm run analyze-project