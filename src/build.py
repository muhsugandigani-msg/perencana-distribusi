import sys
d='/tmp/claude-0/-home-user/dc91ce84-1082-573c-b896-55f769dbd812/scratchpad/'
t=open(d+'app/template.html').read()
css=open(d+'deps/leaflet/dist/leaflet.css').read()
eng=open(d+'app/engine.js').read().replace('if (typeof module !== "undefined") module.exports','if (typeof module !== "undefined" && module.exports) module.exports')
t=t.replace('/*LEAFLET_CSS*/',css).replace('/*ENGINE*/',eng,1).replace('/*SAMPLE*/',open(d+'app/sample.json').read()).replace('/*APP*/',open(d+'app/app.js').read())
open(d+'app/Perencana_Distribusi.html','w').write(t)
# local test version
import re
loc=re.sub(r' integrity="[^"]*" crossorigin="anonymous" referrerpolicy="no-referrer"','',t).replace('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js','../deps/leaflet/dist/leaflet.js').replace('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','../deps/xlsx/dist/xlsx.full.min.js')
open(d+'app/local.html','w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+loc+'</body></html>')
print(len(t))
