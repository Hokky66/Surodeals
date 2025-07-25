#!/bin/bash

# Built-in Node.js modules (ook submodules zoals fs/promises worden herkend)
builtin_modules=(
  "child_process"
  "crypto"
  "fs"
  "path"
  "util"
  "os"
  "http"
  "https"
  "url"
  "stream"
  "buffer"
  "events"
  "net"
  "tls"
  "zlib"
  "readline"
  "dns"
)

modules=$(grep -hroP "(?<=from\s')[^']+|(?<=import\s')[^']+" server | grep -vE '^\.{1,2}/' | sort | uniq)

for mod in $modules; do
  # Pak het eerste deel voor modules als "fs/promises" → "fs"
  root_mod="${mod%%/*}"

  # Check of het een built-in module (of submodule) is
  if [[ " ${builtin_modules[@]} " =~ " ${root_mod} " ]]; then
    echo "Skipping built-in module: $mod"
    continue
  fi

  # Check of package al geïnstalleerd is
  if [ ! -d "node_modules/$mod" ] && [ ! -d "node_modules/$root_mod" ]; then
    echo "Installing missing package: $mod"
    npm install "$mod"
  else
    echo "Package $mod already installed"
  fi
done
