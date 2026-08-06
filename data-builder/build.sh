#!/usr/bin/env bash
if [[ "$(uname -s)" =~ ^(MINGW|MSYS|CYGWIN) ]]; then
    winpty python build.py
else
    python build.py
fi
