"""Check admin_level distribution + whether any relation/way is RW-named."""
import json
import re
import urllib.parse
import urllib.request
from collections import Counter

UA = "jatinegara-siaga-etl/0.1 (community flood intelligence project)"
BBOX = "-6.27,106.85,-6.17,106.95"

def q(qs, label):
    d = urllib.parse.urlencode({"data": qs}).encode()
    r = urllib.request.Request("https://overpass-api.de/api/interpreter", data=d,
                               headers={"User-Agent": UA})
    j = json.loads(urllib.request.urlopen(r, timeout=180).read())
    print(label, ":", json.dumps(j)[:400])

# admin level distribution (relations)
q('[out:json][timeout:120];relation[boundary=administrative](' + BBOX + ');out tags;',
  "all-admin-rels")

# any RW-named boundary element?
q('[out:json][timeout:120];relation[name~"^RW"](' + BBOX + ');out tags;', "rw-rels")
q('[out:json][timeout:120];way[name~"^RW"][boundary](' + BBOX + ');out tags;', "rw-ways")
