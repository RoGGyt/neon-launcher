#!/usr/bin/env bash
# Собирает resources/neon-autohost.jar. Нужен только JDK 17+ (без Gradle и маппингов).
set -euo pipefail
cd "$(dirname "$0")"
rm -rf out && mkdir -p out/stubs out/classes
javac --release 17 -d out/stubs stubs/net/fabricmc/api/ModInitializer.java
javac --release 17 -cp out/stubs -d out/classes src/dev/roggyt/neonautohost/NeonAutoHost.java
cp fabric.mod.json out/classes/
mkdir -p ../../resources
(cd out/classes && jar --create --file ../../../../resources/neon-autohost.jar .)
rm -rf out
echo "resources/neon-autohost.jar готов"
