import sys

f = open(sys.argv[1], 'r', encoding="utf-8")
lines = [line.rstrip('\n') for line in f]
f.close()

lineIdx = 0
date = ""

while lineIdx < len(line):
    if lineIdx == 0:
        date = line[lineIdx]
    