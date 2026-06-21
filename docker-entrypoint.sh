#!/bin/sh
# Clean up Chrome lock files from previous runs (they persist on Docker volumes)
for dir in /app/data/sessions/*/; do
  [ -d "$dir" ] || continue
  rm -f "$dir/SingletonLock" "$dir/SingletonCookie" "$dir/SingletonSocket" "$dir/Singleton" 2>/dev/null
done

# Kill any orphaned Chrome processes
pkill -f "chrome.*--disable-setuid-sandbox" 2>/dev/null || true

# Start the application
exec node /app/dist/main