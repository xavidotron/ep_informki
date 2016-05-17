#!/bin/bash

set -e

plugindir="$(cd "$(dirname "$0")/.." ; pwd)"
tempdir="$(mktemp -d)"

svn co "file:///home/etherpad/repos/$1" "$tempdir"
cd "$tempdir"

mkdir -p "$1.inform/Source"
cat > "$1.inform/Source/story.ni" <<EOF
"$1" by $2

Release along with an interpreter and a website.

Example Location is a room. 
EOF
# Suppress newline
echo -n "$(uuidgen)" > "$1.inform/uuid.txt"
mkdir "$1.materials"

svn add *
svn ci -m 'Initial Inform checkout.'

cd
rm -Rf "$tempdir"
