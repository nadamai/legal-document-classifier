#!/bin/sh
# Creates training/.venv, installs training/requirements.txt and Playwright's
# Chromium. Uses $PYTHON if set, else python3, else the newest python3.X on
# PATH, whichever is first at MIN_MINOR or newer.

set -eu

MIN_MINOR=12

cd "$(dirname "$0")/.."

minor_version() {
	"$1" -c 'import sys; print(sys.version_info[1] if sys.version_info[0] == 3 else 0)' 2>/dev/null
}

is_supported() {
	minor=$(minor_version "$1") && [ "$minor" -ge "$MIN_MINOR" ]
}

# macOS's own python3 is 3.9, so Homebrew's python3.14 and the like are needed.
newest_versioned_python() {
	IFS=:
	for dir in $PATH; do
		ls "$dir" 2>/dev/null || true
	done | grep -E '^python3\.[0-9]+$' | sort -t. -k2 -n -r -u | while read -r name; do
		if is_supported "$name"; then
			echo "$name"
			break
		fi
	done
}

if [ -n "${PYTHON:-}" ]; then
	if ! is_supported "$PYTHON"; then
		echo "PYTHON=$PYTHON isn't Python 3.$MIN_MINOR or newer." >&2
		exit 1
	fi

	python=$PYTHON
elif is_supported python3; then
	python=python3
else
	python=$(newest_versioned_python)
fi

if [ -z "$python" ]; then
	echo "No Python 3.$MIN_MINOR or newer found. Install one (macOS: brew install python)," >&2
	echo "or point PYTHON at it: PYTHON=/path/to/python3 npm run train:setup" >&2
	exit 1
fi

if [ -d training/.venv ]; then
	echo "Reusing training/.venv ($(training/.venv/bin/python --version)). Delete it to switch Python."
else
	echo "Creating training/.venv with $python ($("$python" --version))"
	"$python" -m venv training/.venv
fi

training/.venv/bin/pip install -r training/requirements.txt
training/.venv/bin/playwright install chromium
