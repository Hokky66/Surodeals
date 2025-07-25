#!/bin/bash

# Zoek alle geïmporteerde packages in de 'server' folder
packages=$(grep -hroP "(?<=from\s')[^']+|(?<=import\s')[^']+" server | sort | uniq)

for pkg in $packages; do
  # Sla lokale imports en built-in modules over (beginnen met ., / of bevatten /shared e.d.)
  if [[ "$pkg" == .* ]] || [[ "$pkg" == /* ]] || [[ "$pkg" == ../../* ]]; then
    continue
  fi

  # Check of package al geïnstalleerd is
  if npm list --depth=0 "$pkg" > /dev/null 2>&1; then
    echo "Package $pkg already installed"
  else
    echo "Installing missing package: $pkg"
    npm install "$pkg"
  fi
done
