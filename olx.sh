xvfb-run --auto-servernum --server-args='-screen 0 1024x768x24' node "$(dirname "$0")/olx.js" >> "$(dirname "$0")/../logs/olx.log" 2>&1
