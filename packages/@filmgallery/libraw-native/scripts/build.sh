#!/bin/bash
# 
# FilmGallery LibRaw Native Module Build Script (macOS/Linux)
# 
# This script:
# 1. Downloads LibRaw 0.22 source code
# 2. Builds the native Node.js addon
# 3. Runs tests
# 
# Prerequisites:
# - Node.js 16+
# - C++ compiler (GCC 7+ or Clang 8+)
# - Python 3.6+
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(dirname "$SCRIPT_DIR")"

SKIP_DOWNLOAD=false
DEBUG=false
SKIP_TEST=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-download)
            SKIP_DOWNLOAD=true
            shift
            ;;
        --debug)
            DEBUG=true
            shift
            ;;
        --skip-test)
            SKIP_TEST=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "=== Building @filmgallery/libraw-native ==="
echo ""

cd "$MODULE_DIR"

# Check Node.js
NODE_VERSION=$(node --version)
echo "Node.js version: $NODE_VERSION"

# Check npm
NPM_VERSION=$(npm --version)
echo "npm version: $NPM_VERSION"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Download LibRaw source
if [ "$SKIP_DOWNLOAD" = false ]; then
    echo ""
    echo "Downloading LibRaw source..."
    npm run download-libraw
fi

# Check if LibRaw source exists
LIBRAW_PATH="$MODULE_DIR/deps/libraw/libraw/libraw.h"
if [ ! -f "$LIBRAW_PATH" ]; then
    echo "Error: LibRaw source not found at $LIBRAW_PATH"
    echo "Run: npm run download-libraw"
    exit 1
fi

# Build
echo ""
echo "Building native module..."

if [ "$DEBUG" = true ]; then
    npm run build:debug
else
    npm run build
fi

# Test
if [ "$SKIP_TEST" = false ]; then
    echo ""
    echo "Running tests..."
    npm test
fi

echo ""
echo "=== Build completed successfully! ==="
echo ""
echo "The native module is ready to use."
echo "To use in FilmGallery server, update server/package.json:"
echo '  "@filmgallery/libraw-native": "file:../packages/@filmgallery/libraw-native"'
